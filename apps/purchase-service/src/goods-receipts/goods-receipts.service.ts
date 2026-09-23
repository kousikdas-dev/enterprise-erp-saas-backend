import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  GoodsReceiptPostingStatus,
  GoodsReceiptStatus,
  Prisma,
  PurchaseOrderStatus,
} from '../../generated/prisma-client';
import {
  AccountingJournalClient,
  CreateJournalPostingRequest,
} from '../accounting/accounting-journal.client';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { ActorContext, RequestAuditMeta } from '../auth/actor-context';
import {
  moneyToString,
  parseConversionFactor,
  parsePositiveDecimal,
  quantityToString,
} from '../common/decimal';
import { InventoryStockClient } from '../inventory/inventory-stock.client';
import { PrismaService } from '../prisma/prisma.service';
import { toGoodsReceiptResponse } from './dto/goods-receipt-response';
import { CreateGoodsReceiptDto } from './dto/goods-receipt.dto';

const RECEIPT_INCLUDE = {
  items: { orderBy: { createdAt: 'asc' as const } },
};

const ACCOUNTING_SOURCE_SERVICE = 'purchase-service';

type ReceiptWithItems = Prisma.GoodsReceiptGetPayload<{
  include: typeof RECEIPT_INCLUDE;
}>;

/** Minimal shape needed to build a Goods Receipt's GRNI accounting posting request. */
interface GrniPostingSource {
  id: string;
  items: Array<{
    baseQuantity: Prisma.Decimal | null;
    unitCost: Prisma.Decimal | null;
  }>;
}

// The commercial-UOM receiving quantity is what the warehouse actually
// entered; it must never be sent to Inventory. baseQuantity — computed once
// at creation as quantity × the historical PO conversionFactor and persisted
// on the row — is the ONLY value ever sent to Inventory (PURCHASE_MODULE_PLAN.md
// Section 19.3.3/19.6, D3/D4/D5).

@Injectable()
export class GoodsReceiptsService {
  private readonly logger = new Logger(GoodsReceiptsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryStockClient,
    private readonly audit: IdentityAuditClient,
    private readonly accountingJournal: AccountingJournalClient,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreateGoodsReceiptDto,
    request?: RequestAuditMeta,
  ) {
    const goodsReceiptId = randomUUID();
    const prepared = await this.preparePendingReceipt(
      actor,
      goodsReceiptId,
      dto,
    );
    await this.inventory.applyReceipt(actor, {
      referenceType: 'goods_receipt',
      referenceId: goodsReceiptId,
      warehouseId: dto.warehouseId,
      lines: prepared.inventoryLines,
    });
    const posted = await this.finalizePosted(actor, goodsReceiptId, request);
    return posted;
  }

  async post(
    actor: ActorContext,
    id: string,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.prisma.goodsReceipt.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: RECEIPT_INCLUDE,
    });
    if (!existing) throw new NotFoundException('Goods receipt not found');
    if (existing.status === GoodsReceiptStatus.POSTED) {
      return toGoodsReceiptResponse(existing);
    }
    if (existing.status !== GoodsReceiptStatus.PENDING_STOCK) {
      throw new ConflictException('Goods receipt cannot be posted');
    }

    // Rebuild strictly from the persisted GoodsReceiptItem columns — never
    // recompute quantity × conversionFactor, never re-resolve conversionFactor
    // from current ProductUnit/InventoryProductClient, never join back to
    // PurchaseOrderItem (Section 19.3.4, D6). productId now lives on the
    // GoodsReceiptItem row itself, so no PO-item join is needed at all.
    const inventoryLines = existing.items.map((item) => {
      if (!item.baseQuantity) {
        throw new ConflictException(
          `Goods receipt line ${item.id} has no persisted baseQuantity and cannot be posted; this is a legacy pre-migration record requiring manual review (see PURCHASE_MODULE_PLAN.md Section 19.8.3)`,
        );
      }
      return {
        productId: item.productId,
        quantity: quantityToString(item.baseQuantity),
        ...(item.unitCost ? { unitCost: moneyToString(item.unitCost) } : {}),
      };
    });

    await this.inventory.applyReceipt(actor, {
      referenceType: 'goods_receipt',
      referenceId: existing.id,
      warehouseId: existing.warehouseId,
      lines: inventoryLines,
    });
    return this.finalizePosted(actor, existing.id, request);
  }

  async list(actor: ActorContext) {
    const rows = await this.prisma.goodsReceipt.findMany({
      where: { tenantId: actor.tenantId },
      include: RECEIPT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return { items: rows.map(toGoodsReceiptResponse) };
  }

  async getById(actor: ActorContext, id: string) {
    const row = await this.prisma.goodsReceipt.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: RECEIPT_INCLUDE,
    });
    if (!row) throw new NotFoundException('Goods receipt not found');
    return toGoodsReceiptResponse(row);
  }

  private async preparePendingReceipt(
    actor: ActorContext,
    goodsReceiptId: string,
    dto: CreateGoodsReceiptDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Lock ordering: purchase_orders -> purchase_order_items, mirroring
      // ShipmentsService.preparePendingShipment() exactly (Section 19.4).
      const orderRows = await tx.$queryRaw<
        Array<{ id: string; status: string }>
      >(
        Prisma.sql`
          SELECT id, status::text AS status
          FROM purchase_orders
          WHERE id = ${dto.purchaseOrderId}::uuid AND "tenantId" = ${actor.tenantId}::uuid
          FOR UPDATE
        `,
      );
      const orderLock = orderRows[0];
      if (!orderLock) throw new NotFoundException('Purchase order not found');
      if (
        orderLock.status !== PurchaseOrderStatus.CONFIRMED &&
        orderLock.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED
      ) {
        throw new ConflictException(
          'Purchase order is not open for goods receipt',
        );
      }

      const order = await tx.purchaseOrder.findFirst({
        where: { id: dto.purchaseOrderId, tenantId: actor.tenantId },
        include: { items: true },
      });
      if (!order) throw new NotFoundException('Purchase order not found');

      await tx.$queryRaw`
        SELECT id FROM purchase_order_items
        WHERE "purchaseOrderId" = ${order.id}::uuid
          AND "tenantId" = ${actor.tenantId}::uuid
        FOR UPDATE
      `;

      const pendingByItem = await this.pendingQuantitiesByPurchaseOrderItem(
        tx,
        actor.tenantId,
        order.id,
      );

      // D13 — reject duplicate purchaseOrderItemId values within one
      // request, before any quantity math. Defense-in-depth alongside the
      // DTO-level @NoDuplicatePurchaseOrderItems() validator.
      const seen = new Set<string>();
      for (const line of dto.items) {
        if (seen.has(line.purchaseOrderItemId)) {
          throw new BadRequestException(
            'Duplicate purchase order item in goods receipt',
          );
        }
        seen.add(line.purchaseOrderItemId);
      }

      const itemsById = new Map(order.items.map((item) => [item.id, item]));
      const receiptItems: Array<{
        purchaseOrderItemId: string;
        productId: string;
        productSku: string;
        productName: string;
        unitOfMeasureId: string | null;
        uomCode: string | null;
        uomName: string | null;
        conversionFactor: Prisma.Decimal;
        quantity: Prisma.Decimal;
        baseQuantity: Prisma.Decimal;
        unitCost: Prisma.Decimal;
        productTracksInventory: boolean | null;
      }> = [];

      for (const line of dto.items) {
        // D14 — every purchaseOrderItemId must belong to the selected
        // purchaseOrderId (itemsById is built only from this order's own
        // items) and to the actor's tenant.
        const poItem = itemsById.get(line.purchaseOrderItemId);
        if (!poItem || poItem.tenantId !== actor.tenantId) {
          throw new NotFoundException('Purchase order item not found');
        }
        const qty = parsePositiveDecimal(line.quantity);
        const pending = pendingByItem.get(poItem.id) ?? new Prisma.Decimal(0);
        const remaining = poItem.quantity
          .minus(poItem.receivedQuantity)
          .minus(pending);
        if (qty.gt(remaining)) {
          throw new ConflictException(
            'Receipt quantity exceeds remaining ordered quantity',
          );
        }

        // Never fabricate conversionFactor = 1 for a line that actually has
        // a UOM selected (D12). Only a PO line with no UOM at all
        // (unitOfMeasureId IS NULL) has nothing to convert from, so its
        // implicit factor is 1 — matching PurchaseOrderItem's own
        // "no UOM selected" convention, not a guess.
        const conversionFactor = poItem.unitOfMeasureId
          ? parseConversionFactor(poItem.conversionFactor)
          : new Prisma.Decimal(1);

        // Conversion happens exactly once, here, at the Purchase -> Inventory
        // boundary (Section 19.3.3, D3/D4).
        const baseQuantity = qty
          .mul(conversionFactor)
          .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);

        receiptItems.push({
          purchaseOrderItemId: poItem.id,
          productId: poItem.productId,
          productSku: poItem.productSku,
          productName: poItem.productName,
          unitOfMeasureId: poItem.unitOfMeasureId,
          uomCode: poItem.uomCode,
          uomName: poItem.uomName,
          conversionFactor,
          quantity: qty,
          baseQuantity,
          // Phase 3.1 (GRNI Accounting) — snapshotted verbatim from the
          // parent PurchaseOrderItem at receipt-creation time (D1-style
          // snapshot, never re-resolved). PurchaseOrderItem.unitCost is
          // NOT NULL, so every newly-created GoodsReceiptItem always gets a
          // unitCost; only legacy pre-migration rows can ever be NULL.
          unitCost: poItem.unitCost,
          // Phase 3.2 (GRNI Clearing / PPV) — copied verbatim from the
          // parent PurchaseOrderItem, never re-fetched.
          productTracksInventory: poItem.productTracksInventory,
        });
        pendingByItem.set(poItem.id, pending.plus(qty));
      }

      await tx.goodsReceipt.create({
        data: {
          id: goodsReceiptId,
          tenantId: actor.tenantId,
          purchaseOrderId: order.id,
          warehouseId: dto.warehouseId,
          status: GoodsReceiptStatus.PENDING_STOCK,
          items: {
            create: receiptItems.map((item) => ({
              tenantId: actor.tenantId,
              purchaseOrderItemId: item.purchaseOrderItemId,
              quantity: item.quantity,
              productId: item.productId,
              productSku: item.productSku,
              productName: item.productName,
              unitOfMeasureId: item.unitOfMeasureId,
              uomCode: item.uomCode,
              uomName: item.uomName,
              conversionFactor: item.conversionFactor,
              baseQuantity: item.baseQuantity,
              unitCost: item.unitCost,
              productTracksInventory: item.productTracksInventory,
            })),
          },
        },
      });

      return {
        // Inventory receives baseQuantity ONLY — never the commercial
        // quantity (D5). This is the fix for the gap identified in Section
        // 17.2: prior to this, `quantity` (commercial UOM) was sent verbatim.
        inventoryLines: receiptItems.map((item) => ({
          productId: item.productId,
          quantity: quantityToString(item.baseQuantity),
          unitCost: moneyToString(item.unitCost),
        })),
      };
    });
  }

  private async pendingQuantitiesByPurchaseOrderItem(
    tx: Prisma.TransactionClient,
    tenantId: string,
    purchaseOrderId: string,
  ): Promise<Map<string, Prisma.Decimal>> {
    const pending = await tx.goodsReceiptItem.findMany({
      where: {
        tenantId,
        goodsReceipt: {
          purchaseOrderId,
          tenantId,
          status: GoodsReceiptStatus.PENDING_STOCK,
        },
      },
    });
    const map = new Map<string, Prisma.Decimal>();
    for (const item of pending) {
      const current =
        map.get(item.purchaseOrderItemId) ?? new Prisma.Decimal(0);
      map.set(item.purchaseOrderItemId, current.plus(item.quantity));
    }
    return map;
  }

  private async finalizePosted(
    actor: ActorContext,
    goodsReceiptId: string,
    request?: RequestAuditMeta,
  ) {
    const posted = await this.prisma.$transaction(async (tx) => {
      // Lock ordering: goods_receipts -> purchase_orders ->
      // purchase_order_items, mirroring ShipmentsService.finalizePosted()
      // exactly (Section 19.4).
      const receiptRows = await tx.$queryRaw<
        Array<{ id: string; status: string; purchaseOrderId: string }>
      >(
        Prisma.sql`
          SELECT id, status::text AS status, "purchaseOrderId"
          FROM goods_receipts
          WHERE id = ${goodsReceiptId}::uuid AND "tenantId" = ${actor.tenantId}::uuid
          FOR UPDATE
        `,
      );
      const locked = receiptRows[0];
      if (!locked) throw new NotFoundException('Goods receipt not found');
      if (locked.status === GoodsReceiptStatus.POSTED) {
        return tx.goodsReceipt.findFirstOrThrow({
          where: { id: goodsReceiptId, tenantId: actor.tenantId },
          include: RECEIPT_INCLUDE,
        });
      }
      if (locked.status !== GoodsReceiptStatus.PENDING_STOCK) {
        throw new ConflictException('Goods receipt cannot be finalized');
      }

      await tx.$queryRaw`
        SELECT id FROM purchase_orders
        WHERE id = ${locked.purchaseOrderId}::uuid AND "tenantId" = ${actor.tenantId}::uuid
        FOR UPDATE
      `;

      const receipt = await tx.goodsReceipt.findFirstOrThrow({
        where: { id: goodsReceiptId, tenantId: actor.tenantId },
        include: {
          ...RECEIPT_INCLUDE,
          purchaseOrder: { include: { items: true } },
        },
      });

      await tx.$queryRaw`
        SELECT id FROM purchase_order_items
        WHERE "purchaseOrderId" = ${receipt.purchaseOrderId}::uuid
          AND "tenantId" = ${actor.tenantId}::uuid
        FOR UPDATE
      `;

      // receivedQuantity/PO status semantics below are UNCHANGED from the
      // pre-GR-V1 implementation — accumulation stays entirely in
      // commercial-UOM terms (Section 17.4 invariant 3, Section 19.3.2),
      // never in baseQuantity terms.
      for (const item of receipt.items) {
        const poItem = receipt.purchaseOrder.items.find(
          (row) => row.id === item.purchaseOrderItemId,
        );
        if (!poItem) {
          throw new ConflictException('Purchase order item missing');
        }
        const nextReceived = poItem.receivedQuantity.plus(item.quantity);
        if (nextReceived.gt(poItem.quantity)) {
          throw new ConflictException(
            'Receipt quantity exceeds remaining ordered quantity',
          );
        }
        await tx.purchaseOrderItem.update({
          where: { id: poItem.id },
          data: { receivedQuantity: nextReceived },
        });
      }

      const refreshedItems = await tx.purchaseOrderItem.findMany({
        where: {
          purchaseOrderId: receipt.purchaseOrderId,
          tenantId: actor.tenantId,
        },
      });
      const fullyReceived = refreshedItems.every((item) =>
        item.receivedQuantity.eq(item.quantity),
      );
      await tx.purchaseOrder.update({
        where: { id: receipt.purchaseOrderId },
        data: {
          status: fullyReceived
            ? PurchaseOrderStatus.RECEIVED
            : PurchaseOrderStatus.PARTIALLY_RECEIVED,
        },
      });

      return tx.goodsReceipt.update({
        where: { id: receipt.id },
        data: {
          status: GoodsReceiptStatus.POSTED,
          receivedAt: new Date(),
        },
        include: RECEIPT_INCLUDE,
      });
    });

    await this.audit.record({
      actor,
      action: 'goods-receipt.posted',
      resource: 'goods-receipt',
      resourceId: posted.id,
      metadata: {
        purchaseOrderId: posted.purchaseOrderId,
        warehouseId: posted.warehouseId,
        itemCount: posted.items.length,
      },
      request,
    });

    // Post-commit, best-effort (Phase 3.1 — GRNI Accounting): accounting-service
    // is a separate database, so this is never attempted inside the transaction
    // above. A failure here never fails finalizePosted() itself — the receipt
    // is already, correctly, POSTED regardless of accounting's availability;
    // only accountingPostingStatus reflects the outcome, retryable via
    // retryAccountingPosting(). Relies on accounting-service's own
    // (tenantId, sourceService, sourceType, sourceId) idempotency to make this
    // safe to attempt unconditionally, even on the rare concurrent-race path
    // where `posted` came from finalizePosted()'s own idempotent early return.
    const { receipt: finalRow } = await this.attemptGrniPosting(actor, posted, request);
    return toGoodsReceiptResponse(finalRow);
  }

  /**
   * Manual retry for a POSTED goods receipt whose GRNI accounting posting is
   * currently FAILED (or was never attempted). Rejected for a PENDING_STOCK
   * receipt — nothing to account for until inventory has actually been
   * received. Already-POSTED is a no-op (never calls accounting-service
   * again) rather than an error, mirroring PurchaseInvoicesService's
   * retryAccountingPosting() exactly. Unlike finalizePosted()'s post-commit
   * best-effort call, a failure here is surfaced to the caller: retrying IS
   * the primary action being requested.
   */
  async retryAccountingPosting(
    actor: ActorContext,
    id: string,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.require(actor, id);

    if (existing.status !== GoodsReceiptStatus.POSTED) {
      throw new ConflictException(
        'Only a POSTED goods receipt can have its accounting posting retried',
      );
    }

    if (existing.accountingPostingStatus === GoodsReceiptPostingStatus.POSTED) {
      return toGoodsReceiptResponse(existing);
    }

    const { receipt, error } = await this.attemptGrniPosting(actor, existing, request);
    if (error) {
      throw error;
    }

    await this.audit.record({
      actor,
      action: 'goods-receipt.accounting-posting-retried',
      resource: 'goods-receipt',
      resourceId: receipt.id,
      metadata: { journalEntryId: receipt.journalEntryId },
      request,
    });

    return toGoodsReceiptResponse(receipt);
  }

  private async require(actor: ActorContext, id: string) {
    const row = await this.prisma.goodsReceipt.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: RECEIPT_INCLUDE,
    });
    if (!row) throw new NotFoundException('Goods receipt not found');
    return row;
  }

  /**
   * GRNI accrual: Dr INVENTORY_ASSET / Cr GOODS_RECEIVED_NOT_INVOICED, for
   * baseQuantity x unitCost summed across every line that actually carries a
   * cost. Lines with no unitCost (legacy pre-migration rows only — D12,
   * never fabricated) are silently excluded from the total rather than
   * blocking the whole receipt's posting, mirroring the "cost is optional,
   * a missing one simply contributes nothing" convention already established
   * for Inventory's own receipt endpoint. Returns null when there is nothing
   * postable at all (e.g. every line is a legacy row with no unitCost) — the
   * caller leaves accountingPostingStatus at NOT_POSTED rather than posting
   * a zero-amount journal (accounting-service rejects a non-positive line).
   */
  private buildGrniPostingRequest(
    receipt: GrniPostingSource,
  ): CreateJournalPostingRequest | null {
    let total = new Prisma.Decimal(0);
    for (const item of receipt.items) {
      if (!item.baseQuantity || !item.unitCost) continue;
      total = total.plus(item.baseQuantity.mul(item.unitCost));
    }
    if (total.lte(0)) return null;

    return {
      sourceService: ACCOUNTING_SOURCE_SERVICE,
      sourceType: 'GOODS_RECEIPT',
      sourceId: receipt.id,
      description: `Goods Receipt ${receipt.id}`,
      lines: [
        { role: 'INVENTORY_ASSET', side: 'DEBIT', amount: moneyToString(total) },
        { role: 'GOODS_RECEIVED_NOT_INVOICED', side: 'CREDIT', amount: moneyToString(total) },
      ],
    };
  }

  /**
   * Attempts to post (or idempotently replay) this receipt's GRNI accounting
   * journal and persists the outcome as a Purchase-side cache — never
   * throws: the caller decides whether a failure should be surfaced
   * (retryAccountingPosting does; finalizePosted()'s post-commit call does
   * not). Mirrors PurchaseInvoicesService.attemptInvoicePosting() exactly.
   */
  private async attemptGrniPosting(
    actor: ActorContext,
    receipt: ReceiptWithItems,
    request?: RequestAuditMeta,
  ) {
    const postingRequest = this.buildGrniPostingRequest(receipt);
    if (!postingRequest) {
      // Nothing postable (every line is a legacy row with no unitCost) —
      // nothing was written, so the receipt already in hand is accurate;
      // no re-fetch needed. accountingPostingStatus stays at NOT_POSTED.
      return { receipt, error: undefined as unknown };
    }

    try {
      const result = await this.accountingJournal.post(actor, postingRequest);
      const updated = await this.prisma.goodsReceipt.update({
        where: { id: receipt.id },
        data: {
          accountingPostingStatus: GoodsReceiptPostingStatus.POSTED,
          journalEntryId: result.id,
        },
        include: RECEIPT_INCLUDE,
      });
      await this.audit.record({
        actor,
        action: 'goods-receipt.accounting-posted',
        resource: 'goods-receipt',
        resourceId: receipt.id,
        metadata: {
          journalEntryId: result.id,
          idempotentReplay: result.idempotentReplay,
        },
        request,
      });
      return { receipt: updated, error: undefined as unknown };
    } catch (error) {
      this.logger.error(
        `Failed to post GRNI accounting journal for goods receipt ${receipt.id}`,
        error instanceof Error ? error.stack : undefined,
      );
      try {
        await this.prisma.goodsReceipt.update({
          where: { id: receipt.id },
          data: { accountingPostingStatus: GoodsReceiptPostingStatus.FAILED },
        });
      } catch (updateError) {
        this.logger.error(
          `Failed to record FAILED accounting posting status for goods receipt ${receipt.id}`,
          updateError instanceof Error ? updateError.stack : undefined,
        );
      }
      const refreshed = await this.require(actor, receipt.id);
      return { receipt: refreshed, error };
    }
  }
}
