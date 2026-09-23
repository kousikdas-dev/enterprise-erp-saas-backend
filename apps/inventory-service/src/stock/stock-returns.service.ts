import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StockMovementType } from '../../generated/prisma-client';
import { ActorContext } from '../auth/actor-context';
import {
  moneyToString,
  parsePositiveDecimal,
  quantityToString,
} from '../common/decimal';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateStockReturnDto,
  stockReturnPayloadHash,
} from './dto/stock-return.dto';

const REFERENCE_TYPE = 'sales_return';

export type StockReturnResult = {
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
    originalMovementId: string | null;
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

type LockedOriginalMovement = {
  id: string;
  productId: string;
  warehouseId: string;
  type: string;
  quantity: Prisma.Decimal;
  returnedQuantity: Prisma.Decimal;
  unitCost: Prisma.Decimal | null;
  referenceType: string | null;
  referenceId: string | null;
};

/**
 * Phase 3.4 (Inventory Return Support) — Inventory-only primitive for stock
 * coming back in against a specific, already-identified original SALE
 * movement. Structurally mirrors StockIssuesService/StockReceiptsService
 * (idempotent insert-or-replay via stock_receipt_applications, lock-then-
 * update under FOR UPDATE), with one deliberate difference: the return's
 * unitCost is never client-supplied and never the current moving average —
 * it is read verbatim from the original SALE movement being returned
 * against, which is selected AUTHORITATIVELY by StockReturnLineDto.originalMovementId,
 * never by (referenceType, referenceId, productId) lookup.
 *
 * Inventory never calls accounting-service here (or anywhere) — this
 * service only exposes the authoritative unitCost/totalCost per line for a
 * future caller (e.g. a Sales Return document, in a later phase) to post
 * its own COGS-reversal journal from.
 */
@Injectable()
export class StockReturnsService {
  constructor(private readonly prisma: PrismaService) {}

  async apply(
    actor: ActorContext,
    dto: CreateStockReturnDto,
  ): Promise<StockReturnResult> {
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
      originalMovementId: line.originalMovementId,
    }));
    for (const line of lines) {
      const product = await this.prisma.product.findFirst({
        where: { id: line.productId, tenantId: actor.tenantId },
      });
      if (!product) throw new NotFoundException('Product not found');
    }

    const payloadHash = stockReturnPayloadHash({
      warehouseId: dto.warehouseId,
      originalReferenceType: dto.originalReferenceType,
      originalReferenceId: dto.originalReferenceId,
      lines: lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantityText,
        originalMovementId: line.originalMovementId,
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
        // Lock the original SALE movement FIRST — before checking or
        // updating returnedQuantity — selected authoritatively by id.
        const originalRows = await tx.$queryRaw<LockedOriginalMovement[]>(
          Prisma.sql`
            SELECT id, "productId", "warehouseId", type::text AS type,
                   quantity, "returnedQuantity", "unitCost", "referenceType", "referenceId"
            FROM stock_movements
            WHERE id = ${line.originalMovementId}::uuid AND "tenantId" = ${actor.tenantId}::uuid
            FOR UPDATE
          `,
        );
        const original = originalRows[0];
        if (!original) {
          throw new NotFoundException('Original stock movement not found');
        }
        if (original.type !== StockMovementType.SALE) {
          throw new ConflictException(
            'Original stock movement is not a returnable SALE movement',
          );
        }
        if (original.productId !== line.productId) {
          throw new ConflictException(
            'Original stock movement does not match the requested product',
          );
        }
        if (original.warehouseId !== dto.warehouseId) {
          throw new ConflictException(
            "Return warehouse does not match the original movement's warehouse",
          );
        }
        if (
          dto.originalReferenceType !== undefined &&
          original.referenceType !== dto.originalReferenceType
        ) {
          throw new ConflictException(
            'originalReferenceType does not match the referenced original movement',
          );
        }
        if (
          dto.originalReferenceId !== undefined &&
          original.referenceId !== dto.originalReferenceId
        ) {
          throw new ConflictException(
            'originalReferenceId does not match the referenced original movement',
          );
        }
        if (original.unitCost === null) {
          throw new ConflictException(
            'Original stock movement has no cost information to return against',
          );
        }

        const originalQuantity = new Prisma.Decimal(original.quantity.toString());
        const alreadyReturned = new Prisma.Decimal(
          original.returnedQuantity.toString(),
        );
        const nextReturned = alreadyReturned.plus(line.quantity);
        if (nextReturned.gt(originalQuantity)) {
          throw new ConflictException(
            "Return quantity exceeds the original movement's remaining returnable quantity",
          );
        }

        // Phase 3.4 — the AUTHORITATIVE cost: the original movement's own
        // unitCost, verbatim. Never the current moving average (Stock's
        // totalValue/quantity today), never a caller-supplied value.
        const unitCost = new Prisma.Decimal(original.unitCost.toString());
        const totalCost = line.quantity.mul(unitCost);

        await tx.stockMovement.update({
          where: { id: original.id },
          data: { returnedQuantity: nextReturned },
        });

        const lockedStock = await tx.$queryRaw<
          Array<{ id: string; quantity: Prisma.Decimal; totalValue: Prisma.Decimal }>
        >(
          Prisma.sql`SELECT id, quantity, "totalValue" FROM stocks WHERE "tenantId" = ${actor.tenantId}::uuid AND "productId" = ${line.productId}::uuid AND "warehouseId" = ${dto.warehouseId}::uuid FOR UPDATE`,
        );
        const currentQuantity = lockedStock[0]
          ? new Prisma.Decimal(lockedStock[0].quantity.toString())
          : new Prisma.Decimal(0);
        const currentValue = lockedStock[0]
          ? new Prisma.Decimal(lockedStock[0].totalValue.toString())
          : new Prisma.Decimal(0);
        // A return is purely additive — symmetric with a receipt, opposite
        // of an issue — so it can never drive quantity negative.
        const nextQuantity = currentQuantity.plus(line.quantity);
        const nextValue = currentValue.plus(totalCost);

        const movement = await tx.stockMovement.create({
          data: {
            tenantId: actor.tenantId,
            productId: line.productId,
            warehouseId: dto.warehouseId,
            type: StockMovementType.SALE_RETURN,
            quantity: line.quantity,
            referenceType: REFERENCE_TYPE,
            referenceId: dto.referenceId,
            createdBy: actor.userId,
            unitCost,
            totalCost,
            originalMovementId: original.id,
          },
        });
        const stock = lockedStock[0]
          ? await tx.stock.update({
              where: { id: lockedStock[0].id },
              data: { quantity: nextQuantity, totalValue: nextValue },
            })
          : await tx.stock.create({
              data: {
                tenantId: actor.tenantId,
                productId: line.productId,
                warehouseId: dto.warehouseId,
                quantity: nextQuantity,
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
    dto: CreateStockReturnDto,
    payloadHash: string,
  ): Promise<StockReturnResult> {
    const existing = await tx.stockReceiptApplication.findFirst({
      where: {
        tenantId: actor.tenantId,
        referenceType: REFERENCE_TYPE,
        referenceId: dto.referenceId,
      },
    });
    if (!existing) {
      throw new ConflictException('Sales return application conflict');
    }
    if (
      existing.payloadHash !== payloadHash ||
      existing.warehouseId !== dto.warehouseId
    ) {
      throw new ConflictException(
        'Sales return reference already applied with a different payload',
      );
    }
    const movementRows = await tx.stockMovement.findMany({
      where: {
        tenantId: actor.tenantId,
        referenceType: REFERENCE_TYPE,
        referenceId: dto.referenceId,
        type: StockMovementType.SALE_RETURN,
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
    originalMovementId: string | null;
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
      originalMovementId: row.originalMovementId,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      unitCost: row.unitCost ? moneyToString(row.unitCost) : null,
      totalCost: row.totalCost ? moneyToString(row.totalCost) : null,
    };
  }
}
