import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  OpeningStockStatus,
  Prisma,
  StockMovementType,
} from '../../generated/prisma-client';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { ActorContext, RequestAuditMeta } from '../auth/actor-context';
import {
  moneyToString,
  parseMoney,
  parsePositiveDecimal,
  quantityToString,
} from '../common/decimal';
import { PrismaService } from '../prisma/prisma.service';
import {
  AddOpeningStockLineDto,
  CreateOpeningStockDto,
  OpeningStockQueryDto,
  ReverseOpeningStockDto,
  UpdateOpeningStockDto,
} from './dto/opening-stock.dto';

const REFERENCE_TYPE = 'opening_stock';

const LINE_INCLUDE = { lines: { orderBy: { createdAt: 'asc' as const } } };

/**
 * Sorts distinct (productId, warehouseId) pairs deterministically —
 * productId ASC, then warehouseId ASC — before Stock rows are locked.
 * Applied identically to post() and reverse() so two multi-line operations
 * touching the same product/warehouse set, listed in different orders, can
 * never deadlock: both always acquire locks in this same canonical order
 * (Inventory Design v4, Phase B §12).
 */
function sortedPairs(
  lines: Array<{ productId: string; warehouseId: string }>,
): Array<{ productId: string; warehouseId: string }> {
  const seen = new Map<string, { productId: string; warehouseId: string }>();
  for (const line of lines) {
    seen.set(`${line.productId}::${line.warehouseId}`, {
      productId: line.productId,
      warehouseId: line.warehouseId,
    });
  }
  return Array.from(seen.values()).sort((a, b) =>
    a.productId === b.productId
      ? a.warehouseId.localeCompare(b.warehouseId)
      : a.productId.localeCompare(b.productId),
  );
}

@Injectable()
export class OpeningStockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: IdentityAuditClient,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreateOpeningStockDto,
    request?: RequestAuditMeta,
  ) {
    const id = randomUUID();
    const resolvedLines = dto.lines
      ? await Promise.all(
          dto.lines.map((line) => this.resolveLine(actor, line)),
        )
      : [];

    const header = await this.prisma.$transaction(async (tx) => {
      const documentNumber = await this.nextDocumentNumber(tx, actor.tenantId);
      return tx.openingStock.create({
        data: {
          id,
          tenantId: actor.tenantId,
          documentNumber,
          status: OpeningStockStatus.DRAFT,
          effectiveDate: new Date(dto.effectiveDate),
          notes: dto.notes?.trim() || null,
          createdBy: actor.userId,
          lines: {
            create: resolvedLines.map((line) => ({
              tenantId: actor.tenantId,
              productId: line.productId,
              warehouseId: line.warehouseId,
              quantity: line.quantity,
              unitOfMeasureId: line.unitOfMeasureId,
              uomCode: line.uomCode,
              uomName: line.uomName,
              conversionFactor: line.conversionFactor,
              baseQuantity: line.baseQuantity,
              unitCost: line.unitCost,
            })),
          },
        },
        include: LINE_INCLUDE,
      });
    });

    await this.audit.record({
      actor,
      action: 'opening_stock.created',
      resource: 'opening_stock',
      resourceId: header.id,
      metadata: { documentNumber: header.documentNumber, lineCount: header.lines.length },
      request,
    });

    return this.toResponse(header);
  }

  async list(actor: ActorContext, query: OpeningStockQueryDto) {
    const rows = await this.prisma.openingStock.findMany({
      where: {
        tenantId: actor.tenantId,
        status: this.isValidStatus(query.status) ? query.status : undefined,
        lines: query.productId || query.warehouseId
          ? { some: { productId: query.productId, warehouseId: query.warehouseId } }
          : undefined,
        effectiveDate: this.dateRange(query.effectiveFrom, query.effectiveTo),
      },
      include: LINE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return { items: rows.map((row) => this.toResponse(row)) };
  }

  async getById(actor: ActorContext, id: string) {
    const row = await this.prisma.openingStock.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: LINE_INCLUDE,
    });
    if (!row) throw new NotFoundException('Opening stock document not found');
    return this.toResponse(row);
  }

  async update(
    actor: ActorContext,
    id: string,
    dto: UpdateOpeningStockDto,
  ) {
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lockDraftHeader(tx, actor, id);
      return tx.openingStock.update({
        where: { id },
        data: {
          effectiveDate: dto.effectiveDate ? new Date(dto.effectiveDate) : undefined,
          notes: dto.notes !== undefined ? dto.notes.trim() || null : undefined,
        },
        include: LINE_INCLUDE,
      });
    });
    return this.toResponse(updated);
  }

  async addLine(actor: ActorContext, id: string, dto: AddOpeningStockLineDto) {
    const resolved = await this.resolveLine(actor, dto);
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lockDraftHeader(tx, actor, id);
      const duplicate = await tx.openingStockLine.findFirst({
        where: {
          tenantId: actor.tenantId,
          openingStockId: id,
          productId: resolved.productId,
          warehouseId: resolved.warehouseId,
        },
      });
      if (duplicate) {
        throw new ConflictException(
          'This document already has a line for that product and warehouse',
        );
      }
      await tx.openingStockLine.create({
        data: {
          tenantId: actor.tenantId,
          openingStockId: id,
          productId: resolved.productId,
          warehouseId: resolved.warehouseId,
          quantity: resolved.quantity,
          unitOfMeasureId: resolved.unitOfMeasureId,
          uomCode: resolved.uomCode,
          uomName: resolved.uomName,
          conversionFactor: resolved.conversionFactor,
          baseQuantity: resolved.baseQuantity,
          unitCost: resolved.unitCost,
        },
      });
      return tx.openingStock.findFirstOrThrow({
        where: { id },
        include: LINE_INCLUDE,
      });
    });
    return this.toResponse(updated);
  }

  async removeLine(actor: ActorContext, id: string, lineId: string) {
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lockDraftHeader(tx, actor, id);
      const line = await tx.openingStockLine.findFirst({
        where: { id: lineId, openingStockId: id, tenantId: actor.tenantId },
      });
      if (!line) throw new NotFoundException('Opening stock line not found');
      await tx.openingStockLine.delete({ where: { id: lineId } });
      return tx.openingStock.findFirstOrThrow({
        where: { id },
        include: LINE_INCLUDE,
      });
    });
    return this.toResponse(updated);
  }

  /**
   * Posts a DRAFT document. Locks the header row first (before anything
   * else), so a concurrent post() for the SAME document, a concurrent
   * addLine/removeLine, and this method's own Stock-row locking all
   * serialize through it — this is what makes the DRAFT->POSTED transition
   * itself race-free, not a separate conditional UPDATE (Phase B §5, §12.2).
   * Existing-stock and duplicate-active are both hard blocks with no
   * bypass; a losing concurrent post() for the same document never reaches
   * either check (Phase B §9, §10).
   */
  async post(actor: ActorContext, id: string, request?: RequestAuditMeta) {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const headerLock = await this.lockHeader(tx, actor, id);
      if (headerLock.status === OpeningStockStatus.REVERSED) {
        throw new ConflictException({
          code: 'OPENING_ALREADY_REVERSED',
          message: 'This opening stock document has already been reversed and cannot be posted',
        });
      }
      if (headerLock.status === OpeningStockStatus.POSTED) {
        return { alreadyPosted: true };
      }

      const lines = await tx.openingStockLine.findMany({
        where: { openingStockId: id, tenantId: actor.tenantId },
      });
      if (lines.length === 0) {
        throw new ConflictException('Opening stock document has no lines to post');
      }

      const pairs = sortedPairs(lines);
      const stockByKey = new Map<
        string,
        { id: string; quantity: Prisma.Decimal; totalValue: Prisma.Decimal } | null
      >();
      for (const pair of pairs) {
        const rows = await tx.$queryRaw<
          Array<{ id: string; quantity: Prisma.Decimal; totalValue: Prisma.Decimal }>
        >(
          Prisma.sql`SELECT id, quantity, "totalValue" FROM stocks WHERE "tenantId" = ${actor.tenantId}::uuid AND "productId" = ${pair.productId}::uuid AND "warehouseId" = ${pair.warehouseId}::uuid FOR UPDATE`,
        );
        stockByKey.set(`${pair.productId}::${pair.warehouseId}`, rows[0] ?? null);
      }

      // Existing-stock hard block — no acknowledgement/bypass flag.
      const existingConflicts = pairs
        .map((pair) => ({
          pair,
          stock: stockByKey.get(`${pair.productId}::${pair.warehouseId}`),
        }))
        .filter(({ stock }) => stock && !stock.quantity.eq(0))
        .map(({ pair, stock }) => ({
          productId: pair.productId,
          warehouseId: pair.warehouseId,
          existingQuantity: quantityToString(stock!.quantity),
        }));
      if (existingConflicts.length > 0) {
        throw new ConflictException({
          code: 'OPENING_BLOCKED_EXISTING_STOCK',
          message:
            'One or more lines already have non-zero stock; opening stock cannot be posted over an existing balance',
          details: existingConflicts,
        });
      }

      // Duplicate-active hard block — one row per (tenant, product,
      // warehouse) while an opening is active; the unique constraint is
      // what makes this concurrency-safe, not a pre-check. Uses
      // INSERT ... ON CONFLICT DO NOTHING (never a caught unique-constraint
      // exception) — Postgres aborts the whole transaction after any failed
      // statement, so catching a P2002 here and continuing to query on the
      // same transaction would fail with "current transaction is aborted"
      // on the very next statement. This mirrors StockReceiptApplication's
      // proven idempotency pattern exactly.
      const duplicateConflicts: Array<{
        productId: string;
        warehouseId: string;
        activeOpeningStockId: string;
        activeOpeningStockDocumentNumber: string;
      }> = [];
      for (const pair of pairs) {
        const inserted = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`
            INSERT INTO opening_stock_active_lines (id, "tenantId", "productId", "warehouseId", "openingStockId", "createdAt")
            VALUES (gen_random_uuid(), ${actor.tenantId}::uuid, ${pair.productId}::uuid, ${pair.warehouseId}::uuid, ${id}::uuid, now())
            ON CONFLICT ("tenantId", "productId", "warehouseId") DO NOTHING
            RETURNING id
          `,
        );
        if (inserted.length === 0) {
          const existing = await tx.openingStockActiveLine.findFirst({
            where: {
              tenantId: actor.tenantId,
              productId: pair.productId,
              warehouseId: pair.warehouseId,
            },
          });
          const activeDocument = existing
            ? await tx.openingStock.findFirst({
                where: { id: existing.openingStockId, tenantId: actor.tenantId },
                select: { documentNumber: true },
              })
            : null;
          duplicateConflicts.push({
            productId: pair.productId,
            warehouseId: pair.warehouseId,
            activeOpeningStockId: existing?.openingStockId ?? '',
            activeOpeningStockDocumentNumber: activeDocument?.documentNumber ?? '',
          });
        }
      }
      if (duplicateConflicts.length > 0) {
        throw new ConflictException({
          code: 'OPENING_DUPLICATE_ACTIVE',
          message:
            'One or more lines already have an active (posted, not reversed) opening stock document for that product and warehouse',
          details: duplicateConflicts,
        });
      }

      for (const line of lines) {
        // Inventory Valuation V1 (Phase 2): a line without a unitCost
        // contributes 0 to Stock.totalValue, exactly preserving pre-Phase-2
        // behavior — cost is entirely optional, never inferred or defaulted
        // from Product.costPrice.
        const totalCost = line.unitCost ? line.baseQuantity.mul(line.unitCost) : null;
        const movement = await tx.stockMovement.create({
          data: {
            tenantId: actor.tenantId,
            productId: line.productId,
            warehouseId: line.warehouseId,
            type: StockMovementType.OPENING,
            quantity: line.baseQuantity,
            referenceType: REFERENCE_TYPE,
            referenceId: id,
            createdBy: actor.userId,
            unitCost: line.unitCost,
            totalCost,
          },
        });
        const stock = stockByKey.get(`${line.productId}::${line.warehouseId}`);
        if (stock) {
          await tx.stock.update({
            where: { id: stock.id },
            data: {
              quantity: stock.quantity.plus(line.baseQuantity),
              totalValue: stock.totalValue.plus(totalCost ?? 0),
            },
          });
        } else {
          await tx.stock.create({
            data: {
              tenantId: actor.tenantId,
              productId: line.productId,
              warehouseId: line.warehouseId,
              quantity: line.baseQuantity,
              totalValue: totalCost ?? 0,
            },
          });
        }
        await tx.openingStockLine.update({
          where: { id: line.id },
          data: { stockMovementId: movement.id },
        });
      }

      await tx.openingStock.update({
        where: { id },
        data: {
          status: OpeningStockStatus.POSTED,
          postedAt: new Date(),
          postedBy: actor.userId,
        },
      });
      return { alreadyPosted: false };
    });

    const header = await this.prisma.openingStock.findFirstOrThrow({
      where: { id, tenantId: actor.tenantId },
      include: LINE_INCLUDE,
    });

    if (!outcome.alreadyPosted) {
      await this.audit.record({
        actor,
        action: 'opening_stock.posted',
        resource: 'opening_stock',
        resourceId: id,
        metadata: { documentNumber: header.documentNumber, lineCount: header.lines.length },
        request,
      });
    }

    return this.toResponse(header, { code: outcome.alreadyPosted ? 'OPENING_ALREADY_POSTED' : undefined });
  }

  /**
   * Reverses a POSTED document — blocked entirely if ANY affected
   * product+warehouse has had ANY StockMovement (of any type) since this
   * document's own OPENING movement was created (Phase B §6, §11). Uses the
   * same header-lock-first pattern as post() for the DRAFT/POSTED/REVERSED
   * race safety, plus the same sorted Stock-row locking so the subsequent-
   * activity check and the reversal mutation happen atomically — no window
   * where a Purchase/Sale/Adjustment can be posted in between.
   */
  async reverse(
    actor: ActorContext,
    id: string,
    dto: ReverseOpeningStockDto,
    request?: RequestAuditMeta,
  ) {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const headerLock = await this.lockHeader(tx, actor, id);
      if (headerLock.status === OpeningStockStatus.DRAFT) {
        throw new ConflictException({
          code: 'OPENING_NOT_POSTED',
          message: 'This opening stock document has not been posted and cannot be reversed',
        });
      }
      if (headerLock.status === OpeningStockStatus.REVERSED) {
        return { alreadyReversed: true };
      }

      const lines = await tx.openingStockLine.findMany({
        where: { openingStockId: id, tenantId: actor.tenantId },
      });
      const pairs = sortedPairs(lines);
      const stockByKey = new Map<
        string,
        { id: string; quantity: Prisma.Decimal; totalValue: Prisma.Decimal } | null
      >();
      for (const pair of pairs) {
        const rows = await tx.$queryRaw<
          Array<{ id: string; quantity: Prisma.Decimal; totalValue: Prisma.Decimal }>
        >(
          Prisma.sql`SELECT id, quantity, "totalValue" FROM stocks WHERE "tenantId" = ${actor.tenantId}::uuid AND "productId" = ${pair.productId}::uuid AND "warehouseId" = ${pair.warehouseId}::uuid FOR UPDATE`,
        );
        stockByKey.set(`${pair.productId}::${pair.warehouseId}`, rows[0] ?? null);
      }

      const originalMovements = await tx.stockMovement.findMany({
        where: {
          id: { in: lines.map((line) => line.stockMovementId).filter((v): v is string => !!v) },
        },
      });
      const originalByLine = new Map(originalMovements.map((m) => [m.id, m]));

      const blocked: Array<{
        productId: string;
        warehouseId: string;
        openingMovementId: string;
        subsequentMovementId: string;
        subsequentMovementType: StockMovementType;
        subsequentMovementCreatedAt: Date;
      }> = [];
      for (const line of lines) {
        const original = line.stockMovementId
          ? originalByLine.get(line.stockMovementId)
          : undefined;
        if (!original) {
          throw new ConflictException(
            `Opening stock line ${line.id} is missing its posting movement reference — cannot safely reverse`,
          );
        }
        const subsequent = await tx.stockMovement.findFirst({
          where: {
            tenantId: actor.tenantId,
            productId: line.productId,
            warehouseId: line.warehouseId,
            sequenceNumber: { gt: original.sequenceNumber },
          },
          orderBy: { sequenceNumber: 'asc' },
        });
        if (subsequent) {
          blocked.push({
            productId: line.productId,
            warehouseId: line.warehouseId,
            openingMovementId: original.id,
            subsequentMovementId: subsequent.id,
            subsequentMovementType: subsequent.type,
            subsequentMovementCreatedAt: subsequent.createdAt,
          });
        }
      }
      if (blocked.length > 0) {
        throw new ConflictException({
          code: 'OPENING_REVERSAL_BLOCKED_SUBSEQUENT_ACTIVITY',
          message:
            'This opening stock document cannot be reversed: one or more affected products/warehouses have had stock activity since it was posted',
          details: blocked,
        });
      }

      for (const line of lines) {
        const original = originalByLine.get(line.stockMovementId!)!;
        // Inventory Valuation V1 (Phase 2): the reversal always undoes
        // exactly the value the original OPENING movement contributed
        // (original.totalCost), never a re-derived current average — this is
        // safe and exact (not merely approximate) specifically because
        // reverse() is already hard-blocked above unless this is the only
        // stock-affecting movement since posting, so stock.totalValue at
        // this point can only be what this one movement put there.
        await tx.stockMovement.create({
          data: {
            tenantId: actor.tenantId,
            productId: line.productId,
            warehouseId: line.warehouseId,
            type: StockMovementType.ADJUSTMENT_OUT,
            quantity: line.baseQuantity,
            referenceType: REFERENCE_TYPE,
            referenceId: id,
            reversesMovementId: original.id,
            createdBy: actor.userId,
            unitCost: original.unitCost,
            totalCost: original.totalCost,
          },
        });
        const stock = stockByKey.get(`${line.productId}::${line.warehouseId}`);
        if (stock) {
          const nextQuantity = stock.quantity.minus(line.baseQuantity);
          const nextValue = stock.totalValue.minus(original.totalCost ?? 0);
          await tx.stock.update({
            where: { id: stock.id },
            data: {
              quantity: nextQuantity,
              // Zero-stock rule: quantity reaching exactly 0 forces value to
              // exactly 0 too, rather than trusting arithmetic to land there
              // (defensive against any residual rounding dust).
              totalValue: nextQuantity.eq(0) ? new Prisma.Decimal(0) : nextValue,
            },
          });
        }
        await tx.openingStockActiveLine.deleteMany({
          where: {
            tenantId: actor.tenantId,
            productId: line.productId,
            warehouseId: line.warehouseId,
          },
        });
      }

      await tx.openingStock.update({
        where: { id },
        data: {
          status: OpeningStockStatus.REVERSED,
          reversedAt: new Date(),
          reversedBy: actor.userId,
          reversalReason: dto.reason?.trim() || null,
        },
      });
      return { alreadyReversed: false };
    });

    const header = await this.prisma.openingStock.findFirstOrThrow({
      where: { id, tenantId: actor.tenantId },
      include: LINE_INCLUDE,
    });

    if (!outcome.alreadyReversed) {
      await this.audit.record({
        actor,
        action: 'opening_stock.reversed',
        resource: 'opening_stock',
        resourceId: id,
        metadata: { documentNumber: header.documentNumber, reason: dto.reason ?? null },
        request,
      });
    }

    return this.toResponse(header, {
      code: outcome.alreadyReversed ? 'OPENING_ALREADY_REVERSED' : undefined,
    });
  }

  /** Locks the header row for any DRAFT-only mutation (update/addLine/removeLine). */
  private async lockDraftHeader(
    tx: Prisma.TransactionClient,
    actor: ActorContext,
    id: string,
  ) {
    const headerLock = await this.lockHeader(tx, actor, id);
    if (headerLock.status !== OpeningStockStatus.DRAFT) {
      throw new ConflictException('Opening stock document is not editable once posted');
    }
    return headerLock;
  }

  private async lockHeader(
    tx: Prisma.TransactionClient,
    actor: ActorContext,
    id: string,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string; status: OpeningStockStatus }>>(
      Prisma.sql`SELECT id, status::text AS status FROM opening_stocks WHERE id = ${id}::uuid AND "tenantId" = ${actor.tenantId}::uuid FOR UPDATE`,
    );
    const locked = rows[0];
    if (!locked) throw new NotFoundException('Opening stock document not found');
    return locked;
  }

  /**
   * Resolves and validates a line's UOM against the product's own base unit
   * or its configured ProductUnit alternatives — computed once here and
   * persisted; post() never recomputes it (Phase B §8, §15/§18).
   */
  private async resolveLine(
    actor: ActorContext,
    dto: {
      productId: string;
      warehouseId: string;
      quantity: string;
      unitOfMeasureId: string;
      unitCost: string;
    },
  ) {
    const quantity = parsePositiveDecimal(dto.quantity);
    // Mandatory as of Inventory Valuation V1 (Phase 2) — enforced first by
    // CreateOpeningStockLineDto's own class-validator decorators (400 on a
    // missing/blank field), parsed here into a Decimal the same way every
    // other money field in this service is. OpeningStockLine.unitCost stays
    // nullable at the schema level only for historical rows this code path
    // no longer produces.
    const unitCost = parseMoney(dto.unitCost);
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, tenantId: actor.tenantId },
    });
    if (!product) throw new NotFoundException('Product not found');
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, tenantId: actor.tenantId },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    let conversionFactor: Prisma.Decimal;
    let uomCode: string;
    let uomName: string;

    if (dto.unitOfMeasureId === product.unitOfMeasureId) {
      const unit = await this.prisma.unitOfMeasure.findFirst({
        where: { id: dto.unitOfMeasureId, tenantId: actor.tenantId },
      });
      if (!unit) throw new NotFoundException('Unit of measure not found');
      conversionFactor = new Prisma.Decimal(1);
      uomCode = unit.code;
      uomName = unit.name;
    } else {
      const unit = await this.prisma.unitOfMeasure.findFirst({
        where: { id: dto.unitOfMeasureId, tenantId: actor.tenantId },
      });
      if (!unit) {
        throw new ConflictException({
          code: 'OPENING_UOM_NOT_FOUND',
          message: 'Unit of measure not found',
        });
      }
      const productUnit = await this.prisma.productUnit.findFirst({
        where: {
          tenantId: actor.tenantId,
          productId: dto.productId,
          unitOfMeasureId: dto.unitOfMeasureId,
          isActive: true,
        },
      });
      if (!productUnit) {
        throw new ConflictException({
          code: 'OPENING_UOM_PRODUCT_MISMATCH',
          message: 'The selected unit of measure is not configured for this product',
        });
      }
      if (productUnit.conversionFactor.lte(0)) {
        throw new ConflictException({
          code: 'OPENING_UOM_INVALID_CONVERSION_FACTOR',
          message: 'The selected unit of measure has no positive conversion factor',
        });
      }
      conversionFactor = productUnit.conversionFactor;
      uomCode = unit.code;
      uomName = unit.name;
    }

    return {
      productId: dto.productId,
      warehouseId: dto.warehouseId,
      quantity,
      unitOfMeasureId: dto.unitOfMeasureId,
      uomCode,
      uomName,
      conversionFactor,
      baseQuantity: quantity.mul(conversionFactor),
      unitCost,
    };
  }

  private async nextDocumentNumber(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<string> {
    const count = await tx.openingStock.count({ where: { tenantId } });
    return `OB-${String(count + 1).padStart(8, '0')}`;
  }

  private isValidStatus(value?: string): value is OpeningStockStatus {
    return !!value && value in OpeningStockStatus;
  }

  private dateRange(from?: string, to?: string) {
    if (!from && !to) return undefined;
    const range: { gte?: Date; lte?: Date } = {};
    if (from) range.gte = new Date(from);
    if (to) range.lte = new Date(to);
    return range;
  }

  private toResponse(
    row: {
      id: string;
      tenantId: string;
      documentNumber: string;
      status: OpeningStockStatus;
      effectiveDate: Date;
      postedAt: Date | null;
      postedBy: string | null;
      reversedAt: Date | null;
      reversedBy: string | null;
      reversalReason: string | null;
      notes: string | null;
      createdBy: string;
      createdAt: Date;
      updatedAt: Date;
      lines: Array<{
        id: string;
        productId: string;
        warehouseId: string;
        quantity: Prisma.Decimal;
        unitOfMeasureId: string;
        uomCode: string;
        uomName: string;
        conversionFactor: Prisma.Decimal;
        baseQuantity: Prisma.Decimal;
        unitCost: Prisma.Decimal | null;
        stockMovementId: string | null;
      }>;
    },
    extra?: { code?: string },
  ) {
    return {
      ...(extra?.code ? { code: extra.code } : {}),
      id: row.id,
      tenantId: row.tenantId,
      documentNumber: row.documentNumber,
      status: row.status,
      effectiveDate: row.effectiveDate,
      postedAt: row.postedAt,
      postedBy: row.postedBy,
      reversedAt: row.reversedAt,
      reversedBy: row.reversedBy,
      reversalReason: row.reversalReason,
      notes: row.notes,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lines: row.lines.map((line) => ({
        id: line.id,
        productId: line.productId,
        warehouseId: line.warehouseId,
        quantity: quantityToString(line.quantity),
        unitOfMeasureId: line.unitOfMeasureId,
        uomCode: line.uomCode,
        uomName: line.uomName,
        conversionFactor: line.conversionFactor.toString(),
        baseQuantity: quantityToString(line.baseQuantity),
        unitCost: line.unitCost ? moneyToString(line.unitCost) : null,
        stockMovementId: line.stockMovementId,
      })),
    };
  }
}
