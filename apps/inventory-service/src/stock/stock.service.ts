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
        Array<{ id: string; quantity: Prisma.Decimal }>
      >(
        Prisma.sql`SELECT id, quantity FROM stocks WHERE "tenantId" = ${actor.tenantId}::uuid AND "productId" = ${dto.productId}::uuid AND "warehouseId" = ${dto.warehouseId}::uuid FOR UPDATE`,
      );
      const current = locked[0]
        ? new Prisma.Decimal(locked[0].quantity.toString())
        : new Prisma.Decimal(0);
      const next =
        dto.type === StockMovementType.ADJUSTMENT_OUT
          ? current.minus(quantity)
          : current.plus(quantity);
      if (next.lt(0)) {
        throw new ConflictException('Insufficient stock');
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
        },
      });

      const stock = locked[0]
        ? await tx.stock.update({
            where: { id: locked[0].id },
            data: { quantity: next },
          })
        : await tx.stock.create({
            data: {
              tenantId: actor.tenantId,
              productId: dto.productId,
              warehouseId: dto.warehouseId,
              quantity: next,
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
    };
  }
}
