import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  GoodsReceiptPostingStatus,
  GoodsReceiptStatus,
  Prisma,
  PurchaseInvoiceStatus,
  PurchaseReturnAllocationType,
  PurchaseReturnPostingStatus,
  PurchaseReturnStatus,
} from '../../generated/prisma-client';
import {
  AccountingJournalClient,
  CreateJournalPostingRequest,
} from '../accounting/accounting-journal.client';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { ActorContext, RequestAuditMeta } from '../auth/actor-context';
import { moneyToString, parsePositiveDecimal, roundMoney } from '../common/decimal';
import {
  InventoryStockClient,
  InventoryStockMovementSummary,
} from '../inventory/inventory-stock.client';
import { isUniqueConstraintError } from '../prisma/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePurchaseReturnDto } from './dto/purchase-return.dto';
import { ReversePurchaseReturnDto } from './dto/reverse-purchase-return.dto';
import { toPurchaseReturnResponse } from './dto/purchase-return-response';

const ACCOUNTING_SOURCE_SERVICE = 'purchase-service';

const RETURN_INCLUDE = {
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      goodsReceiptItem: { select: { inventoryMovementId: true } },
      allocations: { orderBy: { createdAt: 'asc' as const } },
    },
  },
};

type ReturnWithItems = Prisma.PurchaseReturnGetPayload<{
  include: typeof RETURN_INCLUDE;
}>;

/** One planned allocation, computed in-memory before any write. */
interface PlannedAllocation {
  purchaseReturnItemId: string;
  goodsReceiptItemId: string;
  allocationType: PurchaseReturnAllocationType;
  purchaseInvoiceItemId?: string;
  baseQuantity: Prisma.Decimal;
  receiptUnitCost: Prisma.Decimal;
  receiptCostAmount: Prisma.Decimal;
  invoiceUnitCost?: Prisma.Decimal;
  invoiceCostAmount?: Prisma.Decimal;
  ppvAmount?: Prisma.Decimal;
}

/**
 * Purchase Return V1 (Phase 3.5). No approval workflow: DRAFT -> CONFIRMED
 * directly, mirroring GoodsReceipt's two-state shape. create() does only
 * structural, soft checks (no lock) — the authoritative allocation/capacity
 * check happens entirely inside confirm()'s own transaction, under lock,
 * exactly like every other document in this module (soft-check-at-create,
 * hard-check-at-confirm).
 *
 * Allocation priority (confirm()): first consume the receipt line's
 * unmatched (never-invoiced) capacity at GoodsReceiptItem.unitCost, then
 * consume matched-invoice slices oldest-first at each slice's own
 * net-of-discount cost, splitting the difference to PURCHASE_PRICE_VARIANCE.
 * matchedQuantity on PurchaseInvoiceGoodsReceiptMatch is NEVER touched by a
 * return — only invoice cancellation decrements it (see that model's schema
 * comment for the full two-counter split this relies on).
 */
@Injectable()
export class PurchaseReturnsService {
  private readonly logger = new Logger(PurchaseReturnsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryStockClient,
    private readonly accountingJournal: AccountingJournalClient,
    private readonly audit: IdentityAuditClient,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreatePurchaseReturnDto,
    request?: RequestAuditMeta,
  ) {
    const goodsReceipt = await this.prisma.goodsReceipt.findFirst({
      where: { id: dto.goodsReceiptId, tenantId: actor.tenantId },
      include: { items: true },
    });
    if (!goodsReceipt) throw new NotFoundException('Goods receipt not found');
    if (
      goodsReceipt.status !== GoodsReceiptStatus.POSTED ||
      goodsReceipt.accountingPostingStatus !== GoodsReceiptPostingStatus.POSTED
    ) {
      throw new ConflictException(
        'Goods receipt has not been posted to inventory/accounting yet',
      );
    }

    // D13-style defense-in-depth — the DTO's own
    // @NoDuplicateGoodsReceiptItems() validator only runs behind a
    // ValidationPipe; the service independently re-checks so a direct
    // caller can never bypass it (mirrors GoodsReceiptsService's own
    // duplicate-purchaseOrderItemId re-check exactly).
    const seen = new Set<string>();
    for (const line of dto.items) {
      if (seen.has(line.goodsReceiptItemId)) {
        throw new BadRequestException(
          'Duplicate goods receipt item in purchase return',
        );
      }
      seen.add(line.goodsReceiptItemId);
    }

    const grItemsById = new Map(
      goodsReceipt.items.map((item) => [item.id, item]),
    );
    const lines = dto.items.map((line) => {
      const grItem = grItemsById.get(line.goodsReceiptItemId);
      if (!grItem || grItem.goodsReceiptId !== goodsReceipt.id) {
        throw new NotFoundException('Goods receipt item not found');
      }
      // Phase 3.5 — a receipt line created before this phase has no
      // captured inventory movement reference and can never be returned via
      // the new primitive: a known, documented limitation, not backfilled.
      if (!grItem.inventoryMovementId) {
        throw new ConflictException(
          `Goods receipt line for product ${grItem.productSku} predates Purchase Return support and cannot be returned`,
        );
      }
      if (grItem.baseQuantity === null || grItem.unitCost === null) {
        throw new ConflictException(
          'Goods receipt item is missing base quantity or cost information',
        );
      }

      const quantity = parsePositiveDecimal(line.quantity);
      const conversionFactor = grItem.conversionFactor ?? new Prisma.Decimal(1);
      // Conversion happens exactly once, here, at creation time — the ONLY
      // value ever sent to Inventory (mirrors GoodsReceiptItem.baseQuantity's
      // own rule).
      const baseQuantity = quantity
        .mul(conversionFactor)
        .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);

      return {
        goodsReceiptItemId: grItem.id,
        productId: grItem.productId,
        productSku: grItem.productSku,
        productName: grItem.productName,
        unitOfMeasureId: grItem.unitOfMeasureId,
        uomCode: grItem.uomCode,
        uomName: grItem.uomName,
        conversionFactor: grItem.conversionFactor,
        quantity,
        baseQuantity,
      };
    });

    for (let attempt = 0; attempt < 5; attempt++) {
      const returnNumber = await this.nextReturnNumber(actor.tenantId);
      try {
        const row = await this.prisma.purchaseReturn.create({
          data: {
            tenantId: actor.tenantId,
            returnNumber,
            goodsReceiptId: goodsReceipt.id,
            warehouseId: goodsReceipt.warehouseId,
            reason: dto.reason?.trim() || null,
            items: {
              create: lines.map((line) => ({
                tenantId: actor.tenantId,
                goodsReceiptItemId: line.goodsReceiptItemId,
                productId: line.productId,
                productSku: line.productSku,
                productName: line.productName,
                unitOfMeasureId: line.unitOfMeasureId,
                uomCode: line.uomCode,
                uomName: line.uomName,
                conversionFactor: line.conversionFactor,
                quantity: line.quantity,
                baseQuantity: line.baseQuantity,
              })),
            },
          },
          include: RETURN_INCLUDE,
        });
        await this.audit.record({
          actor,
          action: 'purchase-return.created',
          resource: 'purchase-return',
          resourceId: row.id,
          metadata: {
            returnNumber: row.returnNumber,
            goodsReceiptId: row.goodsReceiptId,
            itemCount: row.items.length,
          },
          request,
        });
        return toPurchaseReturnResponse(row);
      } catch (error) {
        if (isUniqueConstraintError(error) && attempt < 4) {
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException('Could not allocate purchase return number');
  }

  async list(actor: ActorContext) {
    const rows = await this.prisma.purchaseReturn.findMany({
      where: { tenantId: actor.tenantId },
      include: RETURN_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return { items: rows.map(toPurchaseReturnResponse) };
  }

  async getById(actor: ActorContext, id: string) {
    return toPurchaseReturnResponse(await this.require(actor, id));
  }

  /**
   * DRAFT -> CONFIRMED. Inventory is a hard dependency (called first, must
   * succeed — mirrors GoodsReceipt's applyReceipt-before-finalize ordering);
   * the accounting posting below is post-commit, best-effort, exactly like
   * every other document in this module. Idempotent: re-invoking on an
   * already-CONFIRMED return is a no-op that never re-calls Inventory.
   */
  async confirm(actor: ActorContext, id: string, request?: RequestAuditMeta) {
    const existing = await this.require(actor, id);
    if (existing.status === PurchaseReturnStatus.CONFIRMED) {
      return toPurchaseReturnResponse(existing);
    }
    if (existing.status !== PurchaseReturnStatus.DRAFT) {
      throw new ConflictException('Purchase return cannot be confirmed');
    }

    // Re-verify the receipt is still posted/accounted — soft check before
    // the external call (the authoritative re-check happens again under
    // lock inside allocateAndConfirm()).
    const goodsReceipt = await this.prisma.goodsReceipt.findFirst({
      where: { id: existing.goodsReceiptId, tenantId: actor.tenantId },
    });
    if (
      !goodsReceipt ||
      goodsReceipt.status !== GoodsReceiptStatus.POSTED ||
      goodsReceipt.accountingPostingStatus !== GoodsReceiptPostingStatus.POSTED
    ) {
      throw new ConflictException(
        'Goods receipt has not been posted to inventory/accounting yet',
      );
    }

    const inventoryLines = existing.items.map((item) => {
      const movementId = item.goodsReceiptItem?.inventoryMovementId;
      if (!movementId) {
        throw new ConflictException(
          `Goods receipt line for product ${item.productSku} has no inventory movement reference and cannot be returned`,
        );
      }
      return {
        productId: item.productId,
        quantity: item.baseQuantity.toFixed(6),
        originalMovementId: movementId,
      };
    });

    const inventoryResult = await this.inventory.applyReturn(actor, {
      referenceType: 'purchase_return',
      referenceId: existing.id,
      warehouseId: existing.warehouseId,
      lines: inventoryLines,
    });

    // Phase 3.6 prerequisite — capture the PURCHASE_RETURN movement id each
    // line's applyReturn() call created, zipped positionally against the
    // exact inventoryLines order built above (never by productId: two lines
    // can legitimately share a product). Mirrors GoodsReceiptsService's own
    // zipMovementIds() precedent.
    const movementIdsByItemId = this.zipMovementIds(
      existing.items.map((item) => item.id),
      inventoryResult.movements,
    );

    const confirmed = await this.prisma.$transaction((tx) =>
      this.allocateAndConfirm(tx, actor, id, movementIdsByItemId),
    );

    await this.audit.record({
      actor,
      action: 'purchase-return.confirmed',
      resource: 'purchase-return',
      resourceId: confirmed.id,
      metadata: {
        goodsReceiptId: confirmed.goodsReceiptId,
        itemCount: confirmed.items.length,
      },
      request,
    });

    const { purchaseReturn: finalRow } = await this.attemptReturnPosting(
      actor,
      confirmed,
      request,
    );
    return toPurchaseReturnResponse(finalRow);
  }

  /**
   * Phase 3.6 — CONFIRMED -> REVERSED. Undoes this return's effects on
   * Inventory and the two return-quantity counters
   * (unmatchedReturnedQuantity / matched-bucket returnedQuantity), restoring
   * GoodsReceiptItem/PurchaseInvoiceItem/match-row state to what it was
   * before this return — WITHOUT ever mutating the original, write-once
   * PurchaseReturnItemAllocation rows (they are read-only evidence of
   * exactly what this return contributed, subtracted back out; see
   * restoreAndReverse()). matchedQuantity is never read for writing and
   * never touched — identical to confirm()'s own invariant. Inventory is a
   * hard dependency (called first, must succeed — mirrors confirm()'s own
   * applyReturn-before-finalize ordering); the accounting reversal below is
   * post-commit, best-effort, exactly like PurchaseInvoicesService.cancel().
   * Idempotent: re-invoking on an already-REVERSED return is a no-op that
   * never re-calls Inventory.
   */
  async reverse(
    actor: ActorContext,
    id: string,
    dto: ReversePurchaseReturnDto,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.require(actor, id);
    if (existing.status === PurchaseReturnStatus.REVERSED) {
      return toPurchaseReturnResponse(existing);
    }
    if (existing.status !== PurchaseReturnStatus.CONFIRMED) {
      throw new ConflictException('Only a CONFIRMED purchase return can be reversed');
    }

    const inventoryLines = existing.items.map((item) => {
      const movementId = item.inventoryMovementId;
      if (!movementId) {
        throw new ConflictException(
          `Purchase return line for product ${item.productSku} has no captured inventory movement reference and cannot be reversed`,
        );
      }
      return {
        productId: item.productId,
        quantity: item.baseQuantity.toFixed(6),
        originalMovementId: movementId,
      };
    });

    await this.inventory.applyReturn(actor, {
      referenceType: 'purchase_return_reversal',
      referenceId: existing.id,
      warehouseId: existing.warehouseId,
      lines: inventoryLines,
    });

    const reversed = await this.prisma.$transaction((tx) =>
      this.restoreAndReverse(tx, actor, id, dto.reason),
    );

    await this.audit.record({
      actor,
      action: 'purchase-return.reversed',
      resource: 'purchase-return',
      resourceId: reversed.id,
      metadata: {
        goodsReceiptId: reversed.goodsReceiptId,
        itemCount: reversed.items.length,
        reason: dto.reason?.trim() || null,
      },
      request,
    });

    let finalRow = reversed;
    if (
      reversed.accountingPostingStatus === PurchaseReturnPostingStatus.POSTED &&
      reversed.journalEntryId
    ) {
      const { purchaseReturn: withReversal } = await this.attemptReturnReversal(
        actor,
        reversed,
        request,
      );
      finalRow = withReversal;
    }

    return toPurchaseReturnResponse(finalRow);
  }

  /**
   * Manual retry for a REVERSED purchase return whose accounting reversal
   * (attempted post-commit inside reverse()) failed. Mirrors
   * PurchaseInvoicesService.retryAccountingReversal() exactly: distinguishes
   * accountingPostingStatus POSTED (a journal really was posted and never
   * got reversed — the only case with anything to retry) from FAILED/
   * NOT_POSTED (there was never a posted journal to reverse — a 409, not a
   * silent no-op). Already-REVERSED is a harmless no-op, never re-calling
   * accounting-service.
   */
  async retryAccountingReversal(
    actor: ActorContext,
    id: string,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.require(actor, id);

    if (existing.status !== PurchaseReturnStatus.REVERSED) {
      throw new ConflictException(
        'Only a REVERSED purchase return can have its accounting reversal retried',
      );
    }

    if (existing.accountingPostingStatus === PurchaseReturnPostingStatus.REVERSED) {
      return toPurchaseReturnResponse(existing);
    }

    if (
      existing.accountingPostingStatus !== PurchaseReturnPostingStatus.POSTED ||
      !existing.journalEntryId
    ) {
      throw new ConflictException(
        'This purchase return has no posted accounting journal to reverse',
      );
    }

    const { purchaseReturn, error } = await this.attemptReturnReversal(
      actor,
      existing,
      request,
    );
    if (error) throw error;

    await this.audit.record({
      actor,
      action: 'purchase-return.accounting-reversal-retried',
      resource: 'purchase-return',
      resourceId: purchaseReturn.id,
      metadata: { reversalJournalEntryId: purchaseReturn.reversalJournalEntryId },
      request,
    });

    return toPurchaseReturnResponse(purchaseReturn);
  }

  /**
   * The allocation algorithm, entirely inside one transaction. Lock order —
   * verified to introduce no deadlock risk against PurchaseInvoicesService
   * (which never locks purchase_invoice_items):
   *   1. purchase_returns (header) — idempotent no-op if already CONFIRMED.
   *   2. goods_receipts (single row) — re-verify posted/accounted.
   *   3. goods_receipt_items, ascending id — read baseQuantity/unitCost,
   *      update unmatchedReturnedQuantity. Holding this lock is what makes
   *      the UNLOCKED read of matchedQuantity below safe: any concurrent
   *      PurchaseInvoicesService.confirm()/cancel() also locks
   *      goods_receipt_items before touching the match table, in the same
   *      relative order, so by the time we get past this lock any
   *      concurrent writer has already fully committed.
   *   4. (only if a MATCHED_INVOICE allocation is needed) purchase_invoice_items,
   *      ascending id — the chosen oldest-first slices.
   *   5. (only if needed) purchase_invoice_goods_receipt_matches, ascending
   *      goodsReceiptItemId — LAST, lazily upserted.
   */
  /**
   * Phase 3.6 prerequisite — zips the item ids sent to Inventory (in the
   * exact order inventoryLines/existing.items was built) with the
   * movements[] array Inventory returns, guaranteed to be in that same
   * positional order (StockReturnsService iterates dto.lines and pushes one
   * movement per line, never reordering). Never matched by productId: two
   * lines can legitimately share a product, so only positional matching
   * against the exact request array is safe (mirrors
   * GoodsReceiptsService.zipMovementIds()).
   */
  private zipMovementIds(
    itemIds: string[],
    movements: InventoryStockMovementSummary[],
  ): Map<string, string> {
    if (movements.length !== itemIds.length) {
      throw new ConflictException(
        'Inventory service returned a different number of movements than lines sent',
      );
    }
    const map = new Map<string, string>();
    itemIds.forEach((itemId, index) => {
      map.set(itemId, movements[index].id);
    });
    return map;
  }

  private async allocateAndConfirm(
    tx: Prisma.TransactionClient,
    actor: ActorContext,
    purchaseReturnId: string,
    movementIdsByItemId: Map<string, string>,
  ): Promise<ReturnWithItems> {
    // 1. Lock the header.
    const headerRows = await tx.$queryRaw<Array<{ id: string; status: string }>>(
      Prisma.sql`
        SELECT id, status::text AS status
        FROM purchase_returns
        WHERE id = ${purchaseReturnId}::uuid AND "tenantId" = ${actor.tenantId}::uuid
        FOR UPDATE
      `,
    );
    const locked = headerRows[0];
    if (!locked) throw new NotFoundException('Purchase return not found');
    if (locked.status === PurchaseReturnStatus.CONFIRMED) {
      return tx.purchaseReturn.findFirstOrThrow({
        where: { id: purchaseReturnId, tenantId: actor.tenantId },
        include: RETURN_INCLUDE,
      });
    }
    if (locked.status !== PurchaseReturnStatus.DRAFT) {
      throw new ConflictException('Purchase return cannot be confirmed');
    }

    const purchaseReturn = await tx.purchaseReturn.findFirstOrThrow({
      where: { id: purchaseReturnId, tenantId: actor.tenantId },
      include: { items: true },
    });

    // 2. Lock the goods receipt.
    const grRows = await tx.$queryRaw<
      Array<{ id: string; status: string; accountingPostingStatus: string }>
    >(
      Prisma.sql`
        SELECT id, status::text AS status, "accountingPostingStatus"::text AS "accountingPostingStatus"
        FROM goods_receipts
        WHERE id = ${purchaseReturn.goodsReceiptId}::uuid AND "tenantId" = ${actor.tenantId}::uuid
        FOR UPDATE
      `,
    );
    const gr = grRows[0];
    if (!gr) throw new NotFoundException('Goods receipt not found');
    if (
      gr.status !== GoodsReceiptStatus.POSTED ||
      gr.accountingPostingStatus !== GoodsReceiptPostingStatus.POSTED
    ) {
      throw new ConflictException(
        'Goods receipt has not been posted to inventory/accounting yet',
      );
    }

    // 3. Lock the receipt items, ascending id.
    const grItemIds = Array.from(
      new Set(purchaseReturn.items.map((item) => item.goodsReceiptItemId)),
    );
    const grItemRows = await tx.$queryRaw<
      Array<{
        id: string;
        baseQuantity: Prisma.Decimal | null;
        unitCost: Prisma.Decimal | null;
        unmatchedReturnedQuantity: Prisma.Decimal;
      }>
    >(
      Prisma.sql`
        SELECT id, "baseQuantity", "unitCost", "unmatchedReturnedQuantity"
        FROM goods_receipt_items
        WHERE id = ANY(${grItemIds}::uuid[]) AND "tenantId" = ${actor.tenantId}::uuid
        ORDER BY id
        FOR UPDATE
      `,
    );
    const grItemsById = new Map(grItemRows.map((row) => [row.id, row]));
    for (const grItemId of grItemIds) {
      if (!grItemsById.get(grItemId)) {
        throw new NotFoundException('Goods receipt item not found');
      }
    }

    // Safe unlocked read — see the method-level comment on why this is
    // guaranteed fresh once the goods_receipt_items lock above is held.
    const matchRows = await tx.purchaseInvoiceGoodsReceiptMatch.findMany({
      where: { goodsReceiptItemId: { in: grItemIds }, tenantId: actor.tenantId },
    });
    const matchByGrItemId = new Map(
      matchRows.map((row) => [row.goodsReceiptItemId, row]),
    );

    // --- Pass 1: unmatched-bucket allocations ---------------------------
    const allocations: PlannedAllocation[] = [];
    const unmatchedIncrementByGrItemId = new Map<string, Prisma.Decimal>();
    const remainingByItemId = new Map<string, Prisma.Decimal>();

    for (const item of purchaseReturn.items) {
      const grItem = grItemsById.get(item.goodsReceiptItemId)!;
      if (grItem.baseQuantity === null || grItem.unitCost === null) {
        throw new ConflictException(
          'Goods receipt item is missing base quantity or cost information',
        );
      }
      const match = matchByGrItemId.get(item.goodsReceiptItemId);
      const matchedQuantity = match?.matchedQuantity ?? new Prisma.Decimal(0);
      const alreadyPlannedUnmatched =
        unmatchedIncrementByGrItemId.get(item.goodsReceiptItemId) ??
        new Prisma.Decimal(0);
      const remainingUnmatched = grItem.baseQuantity
        .minus(matchedQuantity)
        .minus(grItem.unmatchedReturnedQuantity)
        .minus(alreadyPlannedUnmatched);

      let stillNeeded = item.baseQuantity;
      if (remainingUnmatched.gt(0) && stillNeeded.gt(0)) {
        const consume = Prisma.Decimal.min(stillNeeded, remainingUnmatched);
        allocations.push({
          purchaseReturnItemId: item.id,
          goodsReceiptItemId: item.goodsReceiptItemId,
          allocationType: PurchaseReturnAllocationType.UNMATCHED_RECEIPT,
          baseQuantity: consume,
          receiptUnitCost: grItem.unitCost,
          receiptCostAmount: roundMoney(consume.mul(grItem.unitCost)),
        });
        unmatchedIncrementByGrItemId.set(
          item.goodsReceiptItemId,
          alreadyPlannedUnmatched.plus(consume),
        );
        stillNeeded = stillNeeded.minus(consume);
      }
      remainingByItemId.set(item.id, stillNeeded);
    }

    // --- Pass 2: matched-bucket allocations, oldest-first ----------------
    const itemsNeedingMatch = purchaseReturn.items.filter((item) =>
      remainingByItemId.get(item.id)!.gt(0),
    );
    const consumedFromSliceId = new Map<string, Prisma.Decimal>();
    const sliceBaseQtyById = new Map<string, Prisma.Decimal>();
    const slicePurchaseInvoiceIdById = new Map<string, string>();

    if (itemsNeedingMatch.length > 0) {
      const grItemIdsNeedingMatch = Array.from(
        new Set(itemsNeedingMatch.map((item) => item.goodsReceiptItemId)),
      );

      // Soft (unlocked) candidate read — informational only, decides which
      // slices and how much to consume from each, oldest invoice first. The
      // hard capacity check happens after locking the chosen rows, below.
      const candidateSlices = await tx.purchaseInvoiceItem.findMany({
        where: {
          tenantId: actor.tenantId,
          goodsReceiptItemId: { in: grItemIdsNeedingMatch },
          purchaseInvoice: { status: PurchaseInvoiceStatus.CONFIRMED },
        },
        select: {
          id: true,
          goodsReceiptItemId: true,
          purchaseInvoiceId: true,
          quantity: true,
          conversionFactor: true,
          lineSubtotal: true,
          returnedQuantity: true,
          purchaseInvoice: { select: { confirmedAt: true } },
        },
        orderBy: [
          { purchaseInvoice: { confirmedAt: 'asc' } },
          { id: 'asc' },
        ],
      });
      const candidatesByGrItemId = new Map<string, typeof candidateSlices>();
      for (const slice of candidateSlices) {
        const list = candidatesByGrItemId.get(slice.goodsReceiptItemId!) ?? [];
        list.push(slice);
        candidatesByGrItemId.set(slice.goodsReceiptItemId!, list);
      }

      for (const item of itemsNeedingMatch) {
        let stillNeeded = remainingByItemId.get(item.id)!;
        const slices = candidatesByGrItemId.get(item.goodsReceiptItemId) ?? [];
        const grItem = grItemsById.get(item.goodsReceiptItemId)!;

        for (const slice of slices) {
          if (stillNeeded.lte(0)) break;
          const conversionFactor = slice.conversionFactor ?? new Prisma.Decimal(1);
          const sliceBaseQty = slice.quantity.mul(conversionFactor);
          const alreadyPlanned =
            consumedFromSliceId.get(slice.id) ?? new Prisma.Decimal(0);
          const sliceRemaining = sliceBaseQty
            .minus(slice.returnedQuantity)
            .minus(alreadyPlanned);
          if (sliceRemaining.lte(0)) continue;

          const consume = Prisma.Decimal.min(stillNeeded, sliceRemaining);
          const invoiceUnitCost = slice.lineSubtotal.div(sliceBaseQty);
          const invoiceCostAmount = roundMoney(consume.mul(invoiceUnitCost));
          const receiptCostAmount = roundMoney(consume.mul(grItem.unitCost!));

          allocations.push({
            purchaseReturnItemId: item.id,
            goodsReceiptItemId: item.goodsReceiptItemId,
            allocationType: PurchaseReturnAllocationType.MATCHED_INVOICE,
            purchaseInvoiceItemId: slice.id,
            baseQuantity: consume,
            receiptUnitCost: grItem.unitCost!,
            receiptCostAmount,
            invoiceUnitCost: roundMoney(invoiceUnitCost),
            invoiceCostAmount,
            ppvAmount: roundMoney(invoiceCostAmount.minus(receiptCostAmount)),
          });

          consumedFromSliceId.set(slice.id, alreadyPlanned.plus(consume));
          sliceBaseQtyById.set(slice.id, sliceBaseQty);
          slicePurchaseInvoiceIdById.set(slice.id, slice.purchaseInvoiceId);
          stillNeeded = stillNeeded.minus(consume);
        }

        if (stillNeeded.gt(0)) {
          throw new ConflictException(
            'Return quantity exceeds the returnable quantity for this goods receipt line',
          );
        }
      }

      // Lock exactly the chosen slice rows, ascending id, and re-verify
      // their authoritative state under lock (a concurrent invoice cancel()
      // could have changed things between the soft read above and here).
      const chosenSliceIds = Array.from(consumedFromSliceId.keys()).sort();
      const lockedSliceRows = await tx.$queryRaw<
        Array<{ id: string; purchaseInvoiceId: string; returnedQuantity: Prisma.Decimal }>
      >(
        Prisma.sql`
          SELECT id, "purchaseInvoiceId", "returnedQuantity"
          FROM purchase_invoice_items
          WHERE id = ANY(${chosenSliceIds}::uuid[]) AND "tenantId" = ${actor.tenantId}::uuid
          ORDER BY id
          FOR UPDATE
        `,
      );
      const lockedSliceById = new Map(lockedSliceRows.map((row) => [row.id, row]));

      const invoiceIds = Array.from(
        new Set(lockedSliceRows.map((row) => row.purchaseInvoiceId)),
      );
      const invoices = await tx.purchaseInvoice.findMany({
        where: { id: { in: invoiceIds }, tenantId: actor.tenantId },
        select: { id: true, status: true },
      });
      const invoiceStatusById = new Map(
        invoices.map((invoice) => [invoice.id, invoice.status]),
      );

      for (const sliceId of chosenSliceIds) {
        const locked = lockedSliceById.get(sliceId);
        if (!locked) {
          throw new ConflictException('Purchase invoice item not found');
        }
        if (
          invoiceStatusById.get(locked.purchaseInvoiceId) !==
          PurchaseInvoiceStatus.CONFIRMED
        ) {
          throw new ConflictException(
            'A matched invoice line used by this return is no longer CONFIRMED',
          );
        }
        const consumed = consumedFromSliceId.get(sliceId)!;
        const sliceBaseQty = sliceBaseQtyById.get(sliceId)!;
        const newReturnedQuantity = locked.returnedQuantity.plus(consumed);
        if (newReturnedQuantity.gt(sliceBaseQty)) {
          throw new ConflictException(
            'Return quantity exceeds the returnable quantity for a matched invoice line',
          );
        }
      }

      // Persist per-slice returnedQuantity increments.
      for (const [sliceId, consumed] of consumedFromSliceId) {
        const locked = lockedSliceById.get(sliceId)!;
        await tx.purchaseInvoiceItem.update({
          where: { id: sliceId },
          data: { returnedQuantity: locked.returnedQuantity.plus(consumed) },
        });
      }

      // Aggregate matched-bucket consumption per GoodsReceiptItem, then
      // lazily upsert + lock + update the match row LAST, per the documented
      // contract.
      const matchIncrementByGrItemId = new Map<string, Prisma.Decimal>();
      for (const allocation of allocations) {
        if (allocation.allocationType !== PurchaseReturnAllocationType.MATCHED_INVOICE) {
          continue;
        }
        const current =
          matchIncrementByGrItemId.get(allocation.goodsReceiptItemId) ??
          new Prisma.Decimal(0);
        matchIncrementByGrItemId.set(
          allocation.goodsReceiptItemId,
          current.plus(allocation.baseQuantity),
        );
      }

      for (const grItemId of matchIncrementByGrItemId.keys()) {
        await tx.purchaseInvoiceGoodsReceiptMatch.upsert({
          where: { goodsReceiptItemId: grItemId },
          create: { tenantId: actor.tenantId, goodsReceiptItemId: grItemId },
          update: {},
        });
      }
      const matchGrItemIds = Array.from(matchIncrementByGrItemId.keys()).sort();
      const lockedMatchRows = await tx.$queryRaw<
        Array<{ id: string; goodsReceiptItemId: string; returnedQuantity: Prisma.Decimal }>
      >(
        Prisma.sql`
          SELECT id, "goodsReceiptItemId", "returnedQuantity"
          FROM purchase_invoice_goods_receipt_matches
          WHERE "goodsReceiptItemId" = ANY(${matchGrItemIds}::uuid[]) AND "tenantId" = ${actor.tenantId}::uuid
          ORDER BY "goodsReceiptItemId"
          FOR UPDATE
        `,
      );
      for (const row of lockedMatchRows) {
        const increment = matchIncrementByGrItemId.get(row.goodsReceiptItemId)!;
        await tx.purchaseInvoiceGoodsReceiptMatch.update({
          where: { id: row.id },
          data: { returnedQuantity: row.returnedQuantity.plus(increment) },
        });
      }
    }

    // Persist GoodsReceiptItem.unmatchedReturnedQuantity increments.
    for (const [grItemId, increment] of unmatchedIncrementByGrItemId) {
      const grItem = grItemsById.get(grItemId)!;
      await tx.goodsReceiptItem.update({
        where: { id: grItemId },
        data: {
          unmatchedReturnedQuantity: grItem.unmatchedReturnedQuantity.plus(increment),
        },
      });
    }

    // Phase 3.6 prerequisite — persist each item's inventory movement
    // reference, captured positionally in confirm() via zipMovementIds().
    // Never overwritten if already populated (defensive; unreachable via
    // this DRAFT-only path today, since a CONFIRMED return short-circuits
    // above before reaching here — but guarded to keep the write idempotent
    // by construction rather than by relying on that call-path invariant).
    for (const item of purchaseReturn.items) {
      if (item.inventoryMovementId) {
        continue;
      }
      const movementId = movementIdsByItemId.get(item.id);
      if (!movementId) {
        throw new ConflictException(
          `No inventory movement id captured for purchase return item ${item.id}`,
        );
      }
      await tx.purchaseReturnItem.update({
        where: { id: item.id },
        data: { inventoryMovementId: movementId },
      });
    }

    // Persist the write-once allocation rows.
    for (const allocation of allocations) {
      await tx.purchaseReturnItemAllocation.create({
        data: {
          tenantId: actor.tenantId,
          purchaseReturnItemId: allocation.purchaseReturnItemId,
          allocationType: allocation.allocationType,
          purchaseInvoiceItemId: allocation.purchaseInvoiceItemId ?? null,
          baseQuantity: allocation.baseQuantity,
          receiptUnitCost: allocation.receiptUnitCost,
          receiptCostAmount: allocation.receiptCostAmount,
          invoiceUnitCost: allocation.invoiceUnitCost ?? null,
          invoiceCostAmount: allocation.invoiceCostAmount ?? null,
          ppvAmount: allocation.ppvAmount ?? null,
        },
      });
    }

    return tx.purchaseReturn.update({
      where: { id: purchaseReturnId },
      data: { status: PurchaseReturnStatus.CONFIRMED, returnedAt: new Date() },
      include: RETURN_INCLUDE,
    });
  }

  /**
   * Phase 3.6 — the restoration algorithm, entirely inside one transaction.
   * Reads each of this return's own PurchaseReturnItemAllocation rows as
   * read-only, immutable evidence of exactly what it contributed and
   * subtracts that back out — correct regardless of what other returns or
   * invoice activity has happened in between, since allocations are
   * write-once and never re-derived (order-independent by construction: no
   * recomputation is ever needed, only "my own recorded amount"). Lock
   * order mirrors allocateAndConfirm()'s own documented contract exactly
   * (same tables, same relative order — no goods_receipts lock, since
   * reversal never needs to re-verify the receipt's own posting status the
   * way confirm() does before allocating NEW returns):
   *   1. purchase_returns (header) — idempotent no-op if already REVERSED.
   *   2. (only if any UNMATCHED_RECEIPT allocation exists) goods_receipt_items,
   *      ascending id — restore unmatchedReturnedQuantity.
   *   3. (only if any MATCHED_INVOICE allocation exists) purchase_invoice_items,
   *      ascending id — restore each slice's returnedQuantity.
   *   4. (only if needed) purchase_invoice_goods_receipt_matches, ascending
   *      goodsReceiptItemId — LAST, restore returnedQuantity. matchedQuantity
   *      is never read for writing and never touched.
   * Every restoration is guarded against going negative (throws rather than
   * clamps — a should-never-happen data-integrity signal, mirrors
   * PurchaseInvoicesService.cancel()'s own reverseGoodsReceiptMatches()
   * convention), and each matched slice's parent invoice is defensively
   * re-checked as still CONFIRMED (belt-and-suspenders only — the 3.5.3
   * cancel() guard already makes an invoice un-cancellable while
   * returnedQuantity > 0, so this should never actually trigger).
   */
  private async restoreAndReverse(
    tx: Prisma.TransactionClient,
    actor: ActorContext,
    purchaseReturnId: string,
    reason: string | undefined,
  ): Promise<ReturnWithItems> {
    // 1. Lock the header.
    const headerRows = await tx.$queryRaw<Array<{ id: string; status: string }>>(
      Prisma.sql`
        SELECT id, status::text AS status
        FROM purchase_returns
        WHERE id = ${purchaseReturnId}::uuid AND "tenantId" = ${actor.tenantId}::uuid
        FOR UPDATE
      `,
    );
    const locked = headerRows[0];
    if (!locked) throw new NotFoundException('Purchase return not found');
    if (locked.status === PurchaseReturnStatus.REVERSED) {
      return tx.purchaseReturn.findFirstOrThrow({
        where: { id: purchaseReturnId, tenantId: actor.tenantId },
        include: RETURN_INCLUDE,
      });
    }
    if (locked.status !== PurchaseReturnStatus.CONFIRMED) {
      throw new ConflictException('Purchase return cannot be reversed');
    }

    const purchaseReturn = await tx.purchaseReturn.findFirstOrThrow({
      where: { id: purchaseReturnId, tenantId: actor.tenantId },
      include: { items: { include: { allocations: true } } },
    });

    // Aggregate per-bucket restoration amounts from this return's own,
    // immutable allocation rows.
    const unmatchedDecrementByGrItemId = new Map<string, Prisma.Decimal>();
    const sliceDecrementBySliceId = new Map<string, Prisma.Decimal>();
    const matchDecrementByGrItemId = new Map<string, Prisma.Decimal>();

    for (const item of purchaseReturn.items) {
      for (const allocation of item.allocations) {
        if (allocation.allocationType === PurchaseReturnAllocationType.UNMATCHED_RECEIPT) {
          const current =
            unmatchedDecrementByGrItemId.get(item.goodsReceiptItemId) ??
            new Prisma.Decimal(0);
          unmatchedDecrementByGrItemId.set(
            item.goodsReceiptItemId,
            current.plus(allocation.baseQuantity),
          );
        } else {
          const sliceId = allocation.purchaseInvoiceItemId!;
          const currentSlice =
            sliceDecrementBySliceId.get(sliceId) ?? new Prisma.Decimal(0);
          sliceDecrementBySliceId.set(sliceId, currentSlice.plus(allocation.baseQuantity));
          const currentMatch =
            matchDecrementByGrItemId.get(item.goodsReceiptItemId) ??
            new Prisma.Decimal(0);
          matchDecrementByGrItemId.set(
            item.goodsReceiptItemId,
            currentMatch.plus(allocation.baseQuantity),
          );
        }
      }
    }

    // 2. Lock and restore GoodsReceiptItem.unmatchedReturnedQuantity, ascending id.
    if (unmatchedDecrementByGrItemId.size > 0) {
      const grItemIds = Array.from(unmatchedDecrementByGrItemId.keys()).sort();
      const grItemRows = await tx.$queryRaw<
        Array<{ id: string; unmatchedReturnedQuantity: Prisma.Decimal }>
      >(
        Prisma.sql`
          SELECT id, "unmatchedReturnedQuantity"
          FROM goods_receipt_items
          WHERE id = ANY(${grItemIds}::uuid[]) AND "tenantId" = ${actor.tenantId}::uuid
          ORDER BY id
          FOR UPDATE
        `,
      );
      const grItemsById = new Map(grItemRows.map((row) => [row.id, row]));
      for (const grItemId of grItemIds) {
        const grItem = grItemsById.get(grItemId);
        if (!grItem) throw new NotFoundException('Goods receipt item not found');
        const decrement = unmatchedDecrementByGrItemId.get(grItemId)!;
        const next = grItem.unmatchedReturnedQuantity.minus(decrement);
        if (next.lt(0)) {
          throw new ConflictException(
            'Reversal would drive unmatchedReturnedQuantity negative for a goods receipt line',
          );
        }
        await tx.goodsReceiptItem.update({
          where: { id: grItemId },
          data: { unmatchedReturnedQuantity: next },
        });
      }
    }

    // 3. Lock and restore each matched slice's returnedQuantity, ascending id.
    if (sliceDecrementBySliceId.size > 0) {
      const sliceIds = Array.from(sliceDecrementBySliceId.keys()).sort();
      const sliceRows = await tx.$queryRaw<
        Array<{ id: string; purchaseInvoiceId: string; returnedQuantity: Prisma.Decimal }>
      >(
        Prisma.sql`
          SELECT id, "purchaseInvoiceId", "returnedQuantity"
          FROM purchase_invoice_items
          WHERE id = ANY(${sliceIds}::uuid[]) AND "tenantId" = ${actor.tenantId}::uuid
          ORDER BY id
          FOR UPDATE
        `,
      );
      const sliceById = new Map(sliceRows.map((row) => [row.id, row]));

      const invoiceIds = Array.from(new Set(sliceRows.map((row) => row.purchaseInvoiceId)));
      const invoices = await tx.purchaseInvoice.findMany({
        where: { id: { in: invoiceIds }, tenantId: actor.tenantId },
        select: { id: true, status: true },
      });
      const invoiceStatusById = new Map(
        invoices.map((invoice) => [invoice.id, invoice.status]),
      );

      for (const sliceId of sliceIds) {
        const slice = sliceById.get(sliceId);
        if (!slice) throw new NotFoundException('Purchase invoice item not found');
        if (
          invoiceStatusById.get(slice.purchaseInvoiceId) !==
          PurchaseInvoiceStatus.CONFIRMED
        ) {
          throw new ConflictException(
            'A matched invoice line used by this return is no longer CONFIRMED',
          );
        }
        const decrement = sliceDecrementBySliceId.get(sliceId)!;
        const next = slice.returnedQuantity.minus(decrement);
        if (next.lt(0)) {
          throw new ConflictException(
            'Reversal would drive returnedQuantity negative for a matched invoice line',
          );
        }
        await tx.purchaseInvoiceItem.update({
          where: { id: sliceId },
          data: { returnedQuantity: next },
        });
      }
    }

    // 4. Lock and restore each match row's returnedQuantity, ascending
    //    goodsReceiptItemId — LAST. matchedQuantity is never read for
    //    writing and never touched.
    if (matchDecrementByGrItemId.size > 0) {
      const matchGrItemIds = Array.from(matchDecrementByGrItemId.keys()).sort();
      const lockedMatchRows = await tx.$queryRaw<
        Array<{ id: string; goodsReceiptItemId: string; returnedQuantity: Prisma.Decimal }>
      >(
        Prisma.sql`
          SELECT id, "goodsReceiptItemId", "returnedQuantity"
          FROM purchase_invoice_goods_receipt_matches
          WHERE "goodsReceiptItemId" = ANY(${matchGrItemIds}::uuid[]) AND "tenantId" = ${actor.tenantId}::uuid
          ORDER BY "goodsReceiptItemId"
          FOR UPDATE
        `,
      );
      const matchByGrItemId = new Map(
        lockedMatchRows.map((row) => [row.goodsReceiptItemId, row]),
      );
      for (const grItemId of matchGrItemIds) {
        const match = matchByGrItemId.get(grItemId);
        if (!match) {
          throw new NotFoundException('Purchase invoice / goods receipt match not found');
        }
        const decrement = matchDecrementByGrItemId.get(grItemId)!;
        const next = match.returnedQuantity.minus(decrement);
        if (next.lt(0)) {
          throw new ConflictException(
            'Reversal would drive returnedQuantity negative for a purchase invoice / goods receipt match',
          );
        }
        await tx.purchaseInvoiceGoodsReceiptMatch.update({
          where: { id: match.id },
          data: { returnedQuantity: next },
        });
      }
    }

    return tx.purchaseReturn.update({
      where: { id: purchaseReturnId },
      data: {
        status: PurchaseReturnStatus.REVERSED,
        reversedAt: new Date(),
        reversalReason: reason?.trim() || null,
      },
      include: RETURN_INCLUDE,
    });
  }

  /**
   * Manual retry for a CONFIRMED purchase return whose accounting posting is
   * currently FAILED (or never attempted). Mirrors
   * GoodsReceiptsService.retryAccountingPosting()/PurchaseInvoicesService's
   * own retry endpoint exactly: a failure here IS surfaced to the caller,
   * unlike confirm()'s post-commit best-effort call.
   */
  async retryAccountingPosting(
    actor: ActorContext,
    id: string,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.require(actor, id);
    if (existing.status !== PurchaseReturnStatus.CONFIRMED) {
      throw new ConflictException(
        'Only a CONFIRMED purchase return can have its accounting posting retried',
      );
    }
    if (existing.accountingPostingStatus === PurchaseReturnPostingStatus.POSTED) {
      return toPurchaseReturnResponse(existing);
    }

    const { purchaseReturn, error } = await this.attemptReturnPosting(
      actor,
      existing,
      request,
    );
    if (error) throw error;

    await this.audit.record({
      actor,
      action: 'purchase-return.accounting-posting-retried',
      resource: 'purchase-return',
      resourceId: purchaseReturn.id,
      metadata: { journalEntryId: purchaseReturn.journalEntryId },
      request,
    });

    return toPurchaseReturnResponse(purchaseReturn);
  }

  private async require(actor: ActorContext, id: string) {
    const row = await this.prisma.purchaseReturn.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: RETURN_INCLUDE,
    });
    if (!row) throw new NotFoundException('Purchase return not found');
    return row;
  }

  private async nextReturnNumber(tenantId: string): Promise<string> {
    const count = await this.prisma.purchaseReturn.count({
      where: { tenantId },
    });
    return `PRET-${String(count + 1).padStart(8, '0')}`;
  }

  /**
   * One aggregated journal per confirm(), tax-exclusive (Phase 3.5 defers
   * Input Tax reversal to a later phase, per the approved design):
   *
   *   UNMATCHED_RECEIPT: Dr GOODS_RECEIVED_NOT_INVOICED / Cr INVENTORY_ASSET,
   *     at receipt cost — reverses part of the GRNI accrual for quantity
   *     that was never invoiced.
   *   MATCHED_INVOICE: Dr ACCOUNTS_PAYABLE (at invoice cost) /
   *     Cr INVENTORY_ASSET (at receipt cost) / Dr-or-Cr PURCHASE_PRICE_VARIANCE
   *     for the difference — the exact opposite-sign mirror of
   *     PurchaseInvoicesService.buildInvoicePostingRequest()'s own ppvTotal
   *     convention, so a return that exactly undoes an invoice's matched
   *     quantity nets its PPV effect to zero.
   *
   * Returns null when there is nothing postable (should not normally happen
   * for a CONFIRMED return with at least one allocation, but mirrors the
   * "never post a zero-amount journal" rule used everywhere else).
   */
  private buildReturnPostingRequest(
    purchaseReturn: ReturnWithItems,
  ): CreateJournalPostingRequest | null {
    let unmatchedTotal = new Prisma.Decimal(0);
    let apTotal = new Prisma.Decimal(0);
    let inventoryTotal = new Prisma.Decimal(0);
    let ppvTotal = new Prisma.Decimal(0);

    for (const item of purchaseReturn.items) {
      for (const allocation of item.allocations) {
        if (allocation.allocationType === PurchaseReturnAllocationType.UNMATCHED_RECEIPT) {
          unmatchedTotal = unmatchedTotal.plus(allocation.receiptCostAmount);
          inventoryTotal = inventoryTotal.plus(allocation.receiptCostAmount);
        } else {
          apTotal = apTotal.plus(allocation.invoiceCostAmount ?? new Prisma.Decimal(0));
          inventoryTotal = inventoryTotal.plus(allocation.receiptCostAmount);
          ppvTotal = ppvTotal.plus(allocation.ppvAmount ?? new Prisma.Decimal(0));
        }
      }
    }

    const lines: CreateJournalPostingRequest['lines'] = [];
    if (unmatchedTotal.gt(0)) {
      lines.push({
        role: 'GOODS_RECEIVED_NOT_INVOICED',
        side: 'DEBIT',
        amount: moneyToString(unmatchedTotal),
      });
    }
    if (apTotal.gt(0)) {
      lines.push({
        role: 'ACCOUNTS_PAYABLE',
        side: 'DEBIT',
        amount: moneyToString(apTotal),
      });
    }
    if (inventoryTotal.gt(0)) {
      lines.push({
        role: 'INVENTORY_ASSET',
        side: 'CREDIT',
        amount: moneyToString(inventoryTotal),
      });
    }
    if (ppvTotal.gt(0)) {
      // Reverses part of an original unfavorable variance.
      lines.push({
        role: 'PURCHASE_PRICE_VARIANCE',
        side: 'CREDIT',
        amount: moneyToString(ppvTotal),
      });
    } else if (ppvTotal.lt(0)) {
      // Reverses part of an original favorable variance.
      lines.push({
        role: 'PURCHASE_PRICE_VARIANCE',
        side: 'DEBIT',
        amount: moneyToString(ppvTotal.abs()),
      });
    }

    if (lines.length === 0) return null;

    return {
      sourceService: ACCOUNTING_SOURCE_SERVICE,
      sourceType: 'PURCHASE_RETURN',
      sourceId: purchaseReturn.id,
      description: `Purchase Return ${purchaseReturn.returnNumber}`,
      lines,
    };
  }

  /**
   * Attempts to post (or idempotently replay) this return's accounting
   * journal and persists the outcome as a Purchase-side cache — never
   * throws: the caller decides whether a failure should be surfaced
   * (retryAccountingPosting does; confirm()'s post-commit call does not).
   * Mirrors GoodsReceiptsService.attemptGrniPosting()/
   * PurchaseInvoicesService.attemptInvoicePosting() exactly.
   */
  private async attemptReturnPosting(
    actor: ActorContext,
    purchaseReturn: ReturnWithItems,
    request?: RequestAuditMeta,
  ) {
    const postingRequest = this.buildReturnPostingRequest(purchaseReturn);
    if (!postingRequest) {
      return { purchaseReturn, error: undefined as unknown };
    }

    try {
      const result = await this.accountingJournal.post(actor, postingRequest);
      const updated = await this.prisma.purchaseReturn.update({
        where: { id: purchaseReturn.id },
        data: {
          accountingPostingStatus: PurchaseReturnPostingStatus.POSTED,
          journalEntryId: result.id,
        },
        include: RETURN_INCLUDE,
      });
      await this.audit.record({
        actor,
        action: 'purchase-return.accounting-posted',
        resource: 'purchase-return',
        resourceId: purchaseReturn.id,
        metadata: {
          journalEntryId: result.id,
          idempotentReplay: result.idempotentReplay,
        },
        request,
      });
      return { purchaseReturn: updated, error: undefined as unknown };
    } catch (error) {
      this.logger.error(
        `Failed to post accounting journal for purchase return ${purchaseReturn.id}`,
        error instanceof Error ? error.stack : undefined,
      );
      try {
        await this.prisma.purchaseReturn.update({
          where: { id: purchaseReturn.id },
          data: { accountingPostingStatus: PurchaseReturnPostingStatus.FAILED },
        });
      } catch (updateError) {
        this.logger.error(
          `Failed to record FAILED accounting posting status for purchase return ${purchaseReturn.id}`,
          updateError instanceof Error ? updateError.stack : undefined,
        );
      }
      const refreshed = await this.require(actor, purchaseReturn.id);
      return { purchaseReturn: refreshed, error };
    }
  }

  /**
   * Phase 3.6 — attempts to reverse (or idempotently replay the reversal of)
   * this return's already-POSTED accounting journal. The original journal
   * entry is never touched — looked up read-only inside accounting-service
   * and stays POSTED permanently (same "no VOID" design as Purchase
   * Invoice). On failure, accountingPostingStatus is deliberately left at
   * POSTED (nothing to update) rather than introducing a new failure state —
   * retryAccountingReversal() is the dedicated retry path. Never throws: the
   * caller decides whether a failure should be surfaced (retryAccountingReversal
   * does; reverse()'s post-commit call does not). Mirrors
   * PurchaseInvoicesService.attemptInvoiceReversal() exactly.
   */
  private async attemptReturnReversal(
    actor: ActorContext,
    purchaseReturn: ReturnWithItems,
    request?: RequestAuditMeta,
  ) {
    try {
      const result = await this.accountingJournal.reverse(actor, {
        sourceService: ACCOUNTING_SOURCE_SERVICE,
        sourceType: 'PURCHASE_RETURN',
        sourceId: purchaseReturn.id,
        reversalSourceType: 'PURCHASE_RETURN_REVERSAL',
        description: `Reversal of ${purchaseReturn.returnNumber}`,
      });
      const updated = await this.prisma.purchaseReturn.update({
        where: { id: purchaseReturn.id },
        data: {
          accountingPostingStatus: PurchaseReturnPostingStatus.REVERSED,
          reversalJournalEntryId: result.id,
        },
        include: RETURN_INCLUDE,
      });
      await this.audit.record({
        actor,
        action: 'purchase-return.accounting-reversed',
        resource: 'purchase-return',
        resourceId: purchaseReturn.id,
        metadata: {
          reversalJournalEntryId: result.id,
          idempotentReplay: result.idempotentReplay,
        },
        request,
      });
      return { purchaseReturn: updated, error: undefined as unknown };
    } catch (error) {
      this.logger.error(
        `Failed to reverse accounting journal for reversed purchase return ${purchaseReturn.id}`,
        error instanceof Error ? error.stack : undefined,
      );
      const refreshed = await this.require(actor, purchaseReturn.id);
      return { purchaseReturn: refreshed, error };
    }
  }
}
