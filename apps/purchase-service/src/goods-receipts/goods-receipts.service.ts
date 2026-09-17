import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  GoodsReceiptStatus,
  Prisma,
  PurchaseOrderStatus,
} from '../../generated/prisma-client';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { ActorContext, RequestAuditMeta } from '../auth/actor-context';
import {
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

// The commercial-UOM receiving quantity is what the warehouse actually
// entered; it must never be sent to Inventory. baseQuantity — computed once
// at creation as quantity × the historical PO conversionFactor and persisted
// on the row — is the ONLY value ever sent to Inventory (PURCHASE_MODULE_PLAN.md
// Section 19.3.3/19.6, D3/D4/D5).

@Injectable()
export class GoodsReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryStockClient,
    private readonly audit: IdentityAuditClient,
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
    return toGoodsReceiptResponse(posted);
  }
}
