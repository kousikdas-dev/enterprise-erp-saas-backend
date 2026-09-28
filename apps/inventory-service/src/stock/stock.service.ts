import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  StockMovementPostingStatus,
  StockMovementType,
} from '../../generated/prisma-client';
import {
  AccountingJournalClient,
  CreateJournalPostingRequest,
} from '../accounting/accounting-journal.client';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { ActorContext, RequestAuditMeta } from '../auth/actor-context';
import {
  decimalToString,
  moneyToString,
  parseMoney,
  parsePositiveDecimal,
  quantityToString,
} from '../common/decimal';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateStockAdjustmentDto,
  StockMovementQueryDto,
  StockQueryDto,
} from './dto/stock.dto';

const ACCOUNTING_SOURCE_SERVICE = 'inventory-service';

/** The full StockMovement row shape used throughout this service — shared
 * by toMovement(), buildAdjustmentPostingRequest(), and
 * attemptAdjustmentPosting() so a single object flows through all three
 * without narrowing/widening type mismatches. */
interface StockMovementRow {
  id: string;
  tenantId: string;
  productId: string;
  warehouseId: string;
  type: StockMovementType;
  quantity: Prisma.Decimal;
  referenceType: string | null;
  referenceId: string | null;
  reason: string | null;
  createdBy: string;
  createdAt: Date;
  unitCost: Prisma.Decimal | null;
  totalCost: Prisma.Decimal | null;
  accountingPostingStatus: StockMovementPostingStatus;
  journalEntryId: string | null;
}

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: IdentityAuditClient,
    private readonly accountingJournal: AccountingJournalClient,
  ) {}

  async list(actor: ActorContext, query: StockQueryDto) {
    const rows = await this.prisma.stock.findMany({
      where: {
        tenantId: actor.tenantId,
        productId: query.productId,
        warehouseId: query.warehouseId,
      },
      orderBy: [{ productId: 'asc' }, { warehouseId: 'asc' }],
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        tenantId: row.tenantId,
        productId: row.productId,
        warehouseId: row.warehouseId,
        quantity: quantityToString(row.quantity),
        totalValue: moneyToString(row.totalValue),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    };
  }

  async listMovements(actor: ActorContext, query: StockMovementQueryDto) {
    const createdAt = this.dateRange(query.from, query.to);
    const rows = await this.prisma.stockMovement.findMany({
      where: {
        tenantId: actor.tenantId,
        productId: query.productId,
        warehouseId: query.warehouseId,
        type: query.type,
        ...(createdAt ? { createdAt } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return { items: rows.map((row) => this.toMovement(row)) };
  }

  async getMovement(actor: ActorContext, id: string) {
    const row = await this.prisma.stockMovement.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!row) throw new NotFoundException('Stock movement not found');
    return this.toMovement(row);
  }

  async adjust(
    actor: ActorContext,
    dto: CreateStockAdjustmentDto,
    request?: RequestAuditMeta,
  ) {
    const quantity = parsePositiveDecimal(dto.quantity);

    // Inventory Valuation V1 (Phase 2): Stock.totalValue is now authoritative,
    // so every quantity-changing adjustment must also carry a valid cost.
    // ADJUSTMENT_IN has no other source of cost, so it's required from the
    // caller; ADJUSTMENT_OUT's cost is always the current moving average
    // (computed under the row lock below), so a client-supplied value would
    // be silently wrong the instant the average has since moved — reject it
    // outright rather than accept-and-ignore it.
    if (dto.type === StockMovementType.ADJUSTMENT_IN && dto.unitCost === undefined) {
      throw new ConflictException({
        code: 'ADJUSTMENT_IN_REQUIRES_UNIT_COST',
        message: 'ADJUSTMENT_IN requires unitCost so Stock.totalValue remains accurate',
      });
    }
    if (dto.type === StockMovementType.ADJUSTMENT_OUT && dto.unitCost !== undefined) {
      throw new ConflictException({
        code: 'ADJUSTMENT_OUT_REJECTS_UNIT_COST',
        message:
          'ADJUSTMENT_OUT cost is always computed from the current moving average and must not be supplied',
      });
    }
    const suppliedUnitCost =
      dto.type === StockMovementType.ADJUSTMENT_IN ? parseMoney(dto.unitCost!) : null;

    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, tenantId: actor.tenantId },
    });
    if (!product) throw new NotFoundException('Product not found');
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, tenantId: actor.tenantId },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    const result = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        Array<{ id: string; quantity: Prisma.Decimal; totalValue: Prisma.Decimal }>
      >(
        Prisma.sql`SELECT id, quantity, "totalValue" FROM stocks WHERE "tenantId" = ${actor.tenantId}::uuid AND "productId" = ${dto.productId}::uuid AND "warehouseId" = ${dto.warehouseId}::uuid FOR UPDATE`,
      );
      const current = locked[0]
        ? new Prisma.Decimal(locked[0].quantity.toString())
        : new Prisma.Decimal(0);

      let next: Prisma.Decimal;
      if (dto.type === StockMovementType.ADJUSTMENT_OUT) {
        next = current.minus(quantity);
        if (next.lt(0)) {
          throw new ConflictException('Insufficient stock');
        }
      } else {
        next = current.plus(quantity);
      }

      const currentValue = locked[0]
        ? new Prisma.Decimal(locked[0].totalValue.toString())
        : new Prisma.Decimal(0);

      let unitCost: Prisma.Decimal;
      let totalCost: Prisma.Decimal;
      let nextValue: Prisma.Decimal;
      if (dto.type === StockMovementType.ADJUSTMENT_OUT) {
        // Never derive a historical cost later from a since-changed Stock
        // average — snapshot it onto the movement now, the same rule as
        // Inventory Issue.
        unitCost = current.gt(0) ? currentValue.div(current) : new Prisma.Decimal(0);
        totalCost = quantity.mul(unitCost);
        // Zero-stock rule: quantity reaching exactly 0 forces value to
        // exactly 0 too, rather than trusting the subtraction to land there.
        nextValue = next.eq(0) ? new Prisma.Decimal(0) : currentValue.minus(totalCost);
      } else {
        unitCost = suppliedUnitCost!;
        totalCost = quantity.mul(unitCost);
        nextValue = currentValue.plus(totalCost);
      }

      const movement = await tx.stockMovement.create({
        data: {
          tenantId: actor.tenantId,
          productId: dto.productId,
          warehouseId: dto.warehouseId,
          type: dto.type,
          quantity,
          reason: dto.reason?.trim() || null,
          createdBy: actor.userId,
          unitCost,
          totalCost,
        },
      });

      const stock = locked[0]
        ? await tx.stock.update({
            where: { id: locked[0].id },
            data: { quantity: next, totalValue: nextValue },
          })
        : await tx.stock.create({
            data: {
              tenantId: actor.tenantId,
              productId: dto.productId,
              warehouseId: dto.warehouseId,
              quantity: next,
              totalValue: nextValue,
            },
          });

      return { stock, movement, resultingQuantity: next };
    });

    await this.audit.record({
      actor,
      action: 'stock.adjusted',
      resource: 'stock',
      resourceId: result.stock.id,
      metadata: {
        productId: dto.productId,
        warehouseId: dto.warehouseId,
        type: dto.type,
        quantity: decimalToString(quantity),
        reason: dto.reason ?? null,
        resultingQuantity: decimalToString(result.resultingQuantity),
        movementId: result.movement.id,
      },
      request,
    });

    // Post-commit, best-effort (Phase 3.15): accounting-service is a
    // separate database, so this is never attempted inside the transaction
    // above. A failure here never fails adjust() itself — the movement/stock
    // are already, correctly, written regardless of accounting's
    // availability; only the movement's own accountingPostingStatus reflects
    // the outcome, retryable via retryAccountingPosting(). Mirrors
    // PurchaseInvoicesService.confirm()'s post-commit call exactly.
    const { movement: finalMovement } = await this.attemptAdjustmentPosting(
      actor,
      result.movement,
      request,
    );

    return {
      stock: {
        id: result.stock.id,
        tenantId: result.stock.tenantId,
        productId: result.stock.productId,
        warehouseId: result.stock.warehouseId,
        quantity: quantityToString(result.stock.quantity),
        totalValue: moneyToString(result.stock.totalValue),
        createdAt: result.stock.createdAt,
        updatedAt: result.stock.updatedAt,
      },
      movement: this.toMovement(finalMovement),
    };
  }

  /**
   * Manual retry for an ADJUSTMENT_IN/ADJUSTMENT_OUT movement whose
   * accounting posting is currently FAILED (or never attempted). Rejected
   * for any other movement type — including the ADJUSTMENT_OUT movements
   * OpeningStockService.reverse() creates internally, which never carry an
   * accounting cache of their own (see StockMovementPostingStatus's own
   * schema comment). Already-POSTED is a no-op (never calls
   * accounting-service again) rather than an error. Unlike adjust()'s
   * post-commit best-effort call, a failure here is surfaced to the caller:
   * retrying IS the primary action being requested. Mirrors
   * PurchaseInvoicesService.retryAccountingPosting() exactly.
   */
  async retryAccountingPosting(
    actor: ActorContext,
    movementId: string,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.prisma.stockMovement.findFirst({
      where: { id: movementId, tenantId: actor.tenantId },
    });
    if (!existing) throw new NotFoundException('Stock movement not found');
    if (
      existing.type !== StockMovementType.ADJUSTMENT_IN &&
      existing.type !== StockMovementType.ADJUSTMENT_OUT
    ) {
      throw new ConflictException(
        'Only an ADJUSTMENT_IN or ADJUSTMENT_OUT movement can have its accounting posting retried',
      );
    }
    if (existing.accountingPostingStatus === StockMovementPostingStatus.POSTED) {
      return this.toMovement(existing);
    }

    const { movement, error } = await this.attemptAdjustmentPosting(actor, existing, request);
    if (error) throw error;

    await this.audit.record({
      actor,
      action: 'stock.accounting-posting-retried',
      resource: 'stock-movement',
      resourceId: movement.id,
      metadata: { journalEntryId: movement.journalEntryId },
      request,
    });

    return this.toMovement(movement);
  }

  /**
   * Dr INVENTORY_ASSET / Cr INVENTORY_ADJUSTMENT for ADJUSTMENT_IN (stock
   * value increases); the exact mirror for ADJUSTMENT_OUT. Reuses the
   * existing INVENTORY_ASSET role (already provisioned for GRNI/COGS) and
   * the new INVENTORY_ADJUSTMENT contra role — no other purpose fits a
   * generic inventory valuation correction (see the schema's own
   * AccountMappingPurpose.INVENTORY_ADJUSTMENT comment). Returns null when
   * there is nothing postable (a zero-value adjustment — e.g. ADJUSTMENT_OUT
   * against stock that was already valued at 0), mirroring the repo-wide
   * "never post a zero-amount journal" convention.
   */
  private buildAdjustmentPostingRequest(
    movement: StockMovementRow,
  ): CreateJournalPostingRequest | null {
    if (!movement.totalCost || movement.totalCost.lte(0)) return null;
    const amount = moneyToString(movement.totalCost);

    const lines: CreateJournalPostingRequest['lines'] =
      movement.type === StockMovementType.ADJUSTMENT_IN
        ? [
            { role: 'INVENTORY_ASSET', side: 'DEBIT', amount },
            { role: 'INVENTORY_ADJUSTMENT', side: 'CREDIT', amount },
          ]
        : [
            { role: 'INVENTORY_ADJUSTMENT', side: 'DEBIT', amount },
            { role: 'INVENTORY_ASSET', side: 'CREDIT', amount },
          ];

    return {
      sourceService: ACCOUNTING_SOURCE_SERVICE,
      sourceType: 'STOCK_ADJUSTMENT',
      sourceId: movement.id,
      description: `Stock Adjustment ${movement.id}`,
      lines,
    };
  }

  /**
   * Attempts to post (or idempotently replay) a Stock Adjustment movement's
   * accounting journal and persists the outcome as an Inventory-side cache
   * — never throws: the caller decides whether a failure should be surfaced
   * (retryAccountingPosting does; adjust()'s post-commit call does not).
   * Mirrors PurchaseInvoicesService.attemptInvoicePosting() exactly.
   */
  private async attemptAdjustmentPosting(
    actor: ActorContext,
    movement: StockMovementRow,
    request?: RequestAuditMeta,
  ) {
    const postingRequest = this.buildAdjustmentPostingRequest(movement);
    if (!postingRequest) {
      return { movement, error: undefined as unknown };
    }

    try {
      const result = await this.accountingJournal.post(actor, postingRequest);
      const updated = await this.prisma.stockMovement.update({
        where: { id: movement.id },
        data: {
          accountingPostingStatus: StockMovementPostingStatus.POSTED,
          journalEntryId: result.id,
        },
      });
      await this.audit.record({
        actor,
        action: 'stock.accounting-posted',
        resource: 'stock-movement',
        resourceId: movement.id,
        metadata: { journalEntryId: result.id, idempotentReplay: result.idempotentReplay },
        request,
      });
      return { movement: updated, error: undefined as unknown };
    } catch (error) {
      this.logger.error(
        `Failed to post accounting journal for stock movement ${movement.id}`,
        error instanceof Error ? error.stack : undefined,
      );
      let updated = movement;
      try {
        updated = await this.prisma.stockMovement.update({
          where: { id: movement.id },
          data: { accountingPostingStatus: StockMovementPostingStatus.FAILED },
        });
      } catch (updateError) {
        this.logger.error(
          `Failed to record FAILED accounting posting status for stock movement ${movement.id}`,
          updateError instanceof Error ? updateError.stack : undefined,
        );
      }
      return { movement: updated, error };
    }
  }

  private dateRange(from?: string, to?: string) {
    if (!from && !to) return undefined;
    const range: { gte?: Date; lte?: Date } = {};
    if (from) range.gte = new Date(from);
    if (to) range.lte = new Date(to);
    return range;
  }

  private toMovement(row: StockMovementRow) {
    return {
      id: row.id,
      tenantId: row.tenantId,
      productId: row.productId,
      warehouseId: row.warehouseId,
      type: row.type,
      quantity: quantityToString(row.quantity),
      referenceType: row.referenceType,
      referenceId: row.referenceId,
      reason: row.reason,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      // Inventory Valuation V1 (Phase 2) — populated for OPENING/PURCHASE/
      // SALE/ADJUSTMENT_IN/ADJUSTMENT_OUT and their reversals; null only for
      // legacy pre-Phase-2 movement rows.
      unitCost: row.unitCost ? moneyToString(row.unitCost) : null,
      totalCost: row.totalCost ? moneyToString(row.totalCost) : null,
      // Phase 3.15 (Inventory Adjustment Accounting) — populated only for
      // ADJUSTMENT_IN/ADJUSTMENT_OUT movements created via adjust(); every
      // other movement type stays at its NOT_POSTED/null default.
      accountingPostingStatus: row.accountingPostingStatus,
      journalEntryId: row.journalEntryId,
    };
  }
}
