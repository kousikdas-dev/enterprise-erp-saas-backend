import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StockMovementType } from '../../generated/prisma-client';
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

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: IdentityAuditClient,
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
      movement: this.toMovement(result.movement),
    };
  }

  private dateRange(from?: string, to?: string) {
    if (!from && !to) return undefined;
    const range: { gte?: Date; lte?: Date } = {};
    if (from) range.gte = new Date(from);
    if (to) range.lte = new Date(to);
    return range;
  }

  private toMovement(row: {
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
  }) {
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
    };
  }
}
