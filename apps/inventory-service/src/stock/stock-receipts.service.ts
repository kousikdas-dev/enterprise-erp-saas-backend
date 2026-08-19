import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StockMovementType } from '../../generated/prisma-client';
import { ActorContext } from '../auth/actor-context';
import {
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
  }>;
  stocks: Array<{
    id: string;
    tenantId: string;
    productId: string;
    warehouseId: string;
    quantity: string;
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
      quantityText: String(line.quantity).trim(),
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
          Array<{ id: string; quantity: Prisma.Decimal }>
        >(
          Prisma.sql`SELECT id, quantity FROM stocks WHERE "tenantId" = ${actor.tenantId}::uuid AND "productId" = ${line.productId}::uuid AND "warehouseId" = ${dto.warehouseId}::uuid FOR UPDATE`,
        );
        const current = locked[0]
          ? new Prisma.Decimal(locked[0].quantity.toString())
          : new Prisma.Decimal(0);
        const next = current.plus(line.quantity);

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
                productId: line.productId,
                warehouseId: dto.warehouseId,
                quantity: next,
              },
            });
        movements.push(this.toMovement(movement));
        stocks.push({
          id: stock.id,
          tenantId: stock.tenantId,
          productId: stock.productId,
          warehouseId: stock.warehouseId,
          quantity: quantityToString(stock.quantity),
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
    };
  }
}
