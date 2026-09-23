import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StockMovementType } from '../../generated/prisma-client';
import { ActorContext } from '../auth/actor-context';
import {
  moneyToString,
  parseMoney,
  parsePositiveDecimal,
  quantityToString,
} from '../common/decimal';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateStockReceiptDto,
  stockReceiptPayloadHash,
} from './dto/stock-receipt.dto';

const REFERENCE_TYPE = 'goods_receipt';

export type StockReceiptResult = {
  created: boolean;
  referenceType: string;
  referenceId: string;
  warehouseId: string;
  movements: Array<{
    id: string;
    tenantId: string;
    productId: string;
    warehouseId: string;
    type: StockMovementType;
    quantity: string;
    referenceType: string | null;
    referenceId: string | null;
    createdBy: string;
    createdAt: Date;
    unitCost: string | null;
    totalCost: string | null;
  }>;
  stocks: Array<{
    id: string;
    tenantId: string;
    productId: string;
    warehouseId: string;
    quantity: string;
    totalValue: string;
  }>;
};

@Injectable()
export class StockReceiptsService {
  constructor(private readonly prisma: PrismaService) {}

  async apply(
    actor: ActorContext,
    dto: CreateStockReceiptDto,
  ): Promise<StockReceiptResult> {
    if (dto.referenceType !== REFERENCE_TYPE) {
      throw new ConflictException('Unsupported referenceType');
    }
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, tenantId: actor.tenantId },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    const lines = dto.lines.map((line) => ({
      productId: line.productId,
      quantity: parsePositiveDecimal(line.quantity),
      quantityText: quantityToString(parsePositiveDecimal(line.quantity)),
      // Inventory Valuation V1 (Phase 2) — optional, per BASE unit. Omitted
      // entirely preserves pre-Phase-2 behavior (0 contribution to
      // Stock.totalValue); purchase-service does not send this yet.
      unitCost: line.unitCost !== undefined ? parseMoney(line.unitCost) : null,
    }));
    for (const line of lines) {
      const product = await this.prisma.product.findFirst({
        where: { id: line.productId, tenantId: actor.tenantId },
      });
      if (!product) throw new NotFoundException('Product not found');
    }

    const payloadHash = stockReceiptPayloadHash({
      warehouseId: dto.warehouseId,
      lines: lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantityText,
        unitCost: line.unitCost ? moneyToString(line.unitCost) : undefined,
      })),
    });

    return this.prisma.$transaction(async (tx) => {
      const inserted = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          INSERT INTO stock_receipt_applications
            (id, "tenantId", "referenceType", "referenceId", "warehouseId", "payloadHash", "createdAt")
          VALUES
            (gen_random_uuid(), ${actor.tenantId}::uuid, ${REFERENCE_TYPE}, ${dto.referenceId}::uuid, ${dto.warehouseId}::uuid, ${payloadHash}, CURRENT_TIMESTAMP)
          ON CONFLICT ("tenantId", "referenceType", "referenceId") DO NOTHING
          RETURNING id
        `,
      );

      if (inserted.length === 0) {
        return this.replayExisting(tx, actor, dto, payloadHash);
      }

      const movements = [];
      const stocks = [];
      for (const line of lines) {
        const locked = await tx.$queryRaw<
          Array<{ id: string; quantity: Prisma.Decimal; totalValue: Prisma.Decimal }>
        >(
          Prisma.sql`SELECT id, quantity, "totalValue" FROM stocks WHERE "tenantId" = ${actor.tenantId}::uuid AND "productId" = ${line.productId}::uuid AND "warehouseId" = ${dto.warehouseId}::uuid FOR UPDATE`,
        );
        const current = locked[0]
          ? new Prisma.Decimal(locked[0].quantity.toString())
          : new Prisma.Decimal(0);
        const next = current.plus(line.quantity);

        // Inventory Valuation V1 (Phase 2) — Moving Average receipt:
        // newValue = oldValue + (receiptQty × receiptCost). A line without
        // unitCost contributes 0, exactly preserving pre-Phase-2 behavior.
        const totalCost = line.unitCost ? line.quantity.mul(line.unitCost) : null;
        const currentValue = locked[0]
          ? new Prisma.Decimal(locked[0].totalValue.toString())
          : new Prisma.Decimal(0);
        const nextValue = currentValue.plus(totalCost ?? 0);

        const movement = await tx.stockMovement.create({
          data: {
            tenantId: actor.tenantId,
            productId: line.productId,
            warehouseId: dto.warehouseId,
            type: StockMovementType.PURCHASE,
            quantity: line.quantity,
            referenceType: REFERENCE_TYPE,
            referenceId: dto.referenceId,
            createdBy: actor.userId,
            unitCost: line.unitCost,
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
                productId: line.productId,
                warehouseId: dto.warehouseId,
                quantity: next,
                totalValue: nextValue,
              },
            });
        movements.push(this.toMovement(movement));
        stocks.push({
          id: stock.id,
          tenantId: stock.tenantId,
          productId: stock.productId,
          warehouseId: stock.warehouseId,
          quantity: quantityToString(stock.quantity),
          totalValue: moneyToString(stock.totalValue),
        });
      }

      return {
        created: true,
        referenceType: REFERENCE_TYPE,
        referenceId: dto.referenceId,
        warehouseId: dto.warehouseId,
        movements,
        stocks,
      };
    });
  }

  private async replayExisting(
    tx: Prisma.TransactionClient,
    actor: ActorContext,
    dto: CreateStockReceiptDto,
    payloadHash: string,
  ): Promise<StockReceiptResult> {
    const existing = await tx.stockReceiptApplication.findFirst({
      where: {
        tenantId: actor.tenantId,
        referenceType: REFERENCE_TYPE,
        referenceId: dto.referenceId,
      },
    });
    if (!existing) {
      throw new ConflictException('Receipt application conflict');
    }
    if (
      existing.payloadHash !== payloadHash ||
      existing.warehouseId !== dto.warehouseId
    ) {
      throw new ConflictException(
        'Goods receipt reference already applied with a different payload',
      );
    }
    const movementRows = await tx.stockMovement.findMany({
      where: {
        tenantId: actor.tenantId,
        referenceType: REFERENCE_TYPE,
        referenceId: dto.referenceId,
        type: StockMovementType.PURCHASE,
      },
      orderBy: { createdAt: 'asc' },
    });
    const stocks = [];
    for (const movement of movementRows) {
      const stock = await tx.stock.findFirst({
        where: {
          tenantId: actor.tenantId,
          productId: movement.productId,
          warehouseId: movement.warehouseId,
        },
      });
      if (stock) {
        stocks.push({
          id: stock.id,
          tenantId: stock.tenantId,
          productId: stock.productId,
          warehouseId: stock.warehouseId,
          quantity: quantityToString(stock.quantity),
          totalValue: moneyToString(stock.totalValue),
        });
      }
    }
    return {
      created: false,
      referenceType: REFERENCE_TYPE,
      referenceId: dto.referenceId,
      warehouseId: dto.warehouseId,
      movements: movementRows.map((row) => this.toMovement(row)),
      stocks,
    };
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
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      unitCost: row.unitCost ? moneyToString(row.unitCost) : null,
      totalCost: row.totalCost ? moneyToString(row.totalCost) : null,
    };
  }
}
