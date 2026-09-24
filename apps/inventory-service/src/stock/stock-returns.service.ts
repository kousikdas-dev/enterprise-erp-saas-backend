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

type ReturnReferenceType =
  | 'sales_return'
  | 'purchase_return'
  | 'purchase_return_reversal';

// Phase 3.5 — each supported referenceType maps to its own original-movement
// type and stock direction. sales_return (Phase 3.4) is additive (mirrors a
// receipt); purchase_return is subtractive (mirrors an issue — stock leaves
// the warehouse back to the vendor) and therefore carries an "Insufficient
// stock" guard sales_return never needed.
//
// Phase 3.6 adds purchase_return_reversal: undoes a specific PURCHASE_RETURN
// movement. Additive (mirrors a receipt — stock coming back in), costed at
// that PURCHASE_RETURN movement's own unitCost verbatim (the shared "original
// movement's own unitCost, never current average" rule below already gives
// this for free). setsReversesMovementId is true ONLY for this entry: it
// makes the created movement also set StockMovement.reversesMovementId,
// giving a second, independent, DB-enforced "at most one reversal, ever"
// guarantee via the already-existing @@unique([reversesMovementId])
// constraint — on top of the quantity-cap check every entry already gets via
// the target movement's own returnedQuantity field. Verified safe to reuse
// alongside Opening Stock's own use of the same column: reversesMovementId is
// a single-column, table-wide unique index over movement ids, which are
// globally unique, so an Opening Stock reversal row and a Purchase Return
// reversal row can never collide; no other code in the repo reads this
// column, so no hidden exclusivity assumption exists to violate.
const RETURN_CONFIG: Record<
  ReturnReferenceType,
  {
    originalType: StockMovementType;
    resultType: StockMovementType;
    direction: 'additive' | 'subtractive';
    setsReversesMovementId: boolean;
  }
> = {
  sales_return: {
    originalType: StockMovementType.SALE,
    resultType: StockMovementType.SALE_RETURN,
    direction: 'additive',
    setsReversesMovementId: false,
  },
  purchase_return: {
    originalType: StockMovementType.PURCHASE,
    resultType: StockMovementType.PURCHASE_RETURN,
    direction: 'subtractive',
    setsReversesMovementId: false,
  },
  purchase_return_reversal: {
    originalType: StockMovementType.PURCHASE_RETURN,
    resultType: StockMovementType.PURCHASE_RETURN_REVERSAL,
    direction: 'additive',
    setsReversesMovementId: true,
  },
};

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
  // Phase 3.6 — only read for purchase_return_reversal: the grandparent
  // PURCHASE movement this PURCHASE_RETURN movement itself returned
  // against. Needed so reversing a return can decrement that grandparent's
  // OWN returnedQuantity by the same amount the original return added to
  // it — otherwise a return-then-reverse cycle would permanently consume
  // returnable capacity on the grandparent, never freeing it back up.
  originalMovementId: string | null;
};

/**
 * Phase 3.4 (Inventory Return Support, sales_return) / Phase 3.5
 * (purchase_return) — Inventory-only primitive for stock moving against a
 * specific, already-identified original movement. Structurally mirrors
 * StockIssuesService/StockReceiptsService (idempotent insert-or-replay via
 * stock_receipt_applications, lock-then-update under FOR UPDATE), with one
 * deliberate difference shared by both return types: the return's unitCost
 * is never client-supplied and never the current moving average — it is
 * read verbatim from the original movement being returned against, which is
 * selected AUTHORITATIVELY by StockReturnLineDto.originalMovementId, never
 * by (referenceType, referenceId, productId) lookup.
 *
 * sales_return is additive (mirrors a receipt — goods coming back from a
 * customer); purchase_return is subtractive (mirrors an issue — goods going
 * back to a vendor) and enforces an "Insufficient stock" guard sales_return
 * never needed. See RETURN_CONFIG above for the exact per-type mapping.
 *
 * Inventory never calls accounting-service here (or anywhere) — this
 * service only exposes the authoritative unitCost/totalCost per line for a
 * caller (a Sales Return or Purchase Return document) to post its own
 * reversing journal from.
 */
@Injectable()
export class StockReturnsService {
  constructor(private readonly prisma: PrismaService) {}

  async apply(
    actor: ActorContext,
    dto: CreateStockReturnDto,
  ): Promise<StockReturnResult> {
    const config = RETURN_CONFIG[dto.referenceType];
    if (!config) {
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
            (gen_random_uuid(), ${actor.tenantId}::uuid, ${dto.referenceType}, ${dto.referenceId}::uuid, ${dto.warehouseId}::uuid, ${payloadHash}, CURRENT_TIMESTAMP)
          ON CONFLICT ("tenantId", "referenceType", "referenceId") DO NOTHING
          RETURNING id
        `,
      );

      if (inserted.length === 0) {
        return this.replayExisting(tx, actor, dto, config, payloadHash);
      }

      const movements = [];
      const stocks = [];
      for (const line of lines) {
        // Lock the original SALE movement FIRST — before checking or
        // updating returnedQuantity — selected authoritatively by id.
        const originalRows = await tx.$queryRaw<LockedOriginalMovement[]>(
          Prisma.sql`
            SELECT id, "productId", "warehouseId", type::text AS type,
                   quantity, "returnedQuantity", "unitCost", "referenceType", "referenceId",
                   "originalMovementId"
            FROM stock_movements
            WHERE id = ${line.originalMovementId}::uuid AND "tenantId" = ${actor.tenantId}::uuid
            FOR UPDATE
          `,
        );
        const original = originalRows[0];
        if (!original) {
          throw new NotFoundException('Original stock movement not found');
        }
        if (original.type !== config.originalType) {
          throw new ConflictException(
            `Original stock movement is not a returnable ${config.originalType} movement`,
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

        // Phase 3.6 — purchase_return_reversal only: the movement being
        // reversed (a PURCHASE_RETURN) itself has its own originalMovementId
        // pointing at the grandparent PURCHASE movement it returned against.
        // That grandparent's returnedQuantity was incremented by the
        // original return; reversing it must decrement that same amount
        // back out, or the grandparent's returnable capacity would be
        // permanently and incorrectly consumed even after a full reversal.
        // Locked and updated here, after the target movement's own lock —
        // a third, distinct row, never the same as `original` itself.
        if (config.setsReversesMovementId && original.originalMovementId) {
          const grandparentRows = await tx.$queryRaw<
            Array<{ id: string; quantity: Prisma.Decimal; returnedQuantity: Prisma.Decimal }>
          >(
            Prisma.sql`
              SELECT id, quantity, "returnedQuantity"
              FROM stock_movements
              WHERE id = ${original.originalMovementId}::uuid AND "tenantId" = ${actor.tenantId}::uuid
              FOR UPDATE
            `,
          );
          const grandparent = grandparentRows[0];
          if (!grandparent) {
            throw new NotFoundException('Grandparent stock movement not found');
          }
          const grandparentNextReturned = new Prisma.Decimal(
            grandparent.returnedQuantity.toString(),
          ).minus(line.quantity);
          if (grandparentNextReturned.lt(0)) {
            throw new ConflictException(
              "Reversal would drive the grandparent movement's returnedQuantity negative",
            );
          }
          await tx.stockMovement.update({
            where: { id: grandparent.id },
            data: { returnedQuantity: grandparentNextReturned },
          });
        }

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
        // sales_return is additive — symmetric with a receipt — and can
        // never drive quantity negative. purchase_return is subtractive —
        // symmetric with an issue — and must guard against insufficient
        // stock, exactly like StockIssuesService.
        let nextQuantity: Prisma.Decimal;
        let nextValue: Prisma.Decimal;
        if (config.direction === 'additive') {
          nextQuantity = currentQuantity.plus(line.quantity);
          nextValue = currentValue.plus(totalCost);
        } else {
          nextQuantity = currentQuantity.minus(line.quantity);
          if (nextQuantity.lt(0)) {
            throw new ConflictException('Insufficient stock');
          }
          // Zero-stock rule (mirrors StockIssuesService): quantity reaching
          // exactly 0 forces value to exactly 0 too, rather than trusting
          // the subtraction to land there.
          nextValue = nextQuantity.eq(0)
            ? new Prisma.Decimal(0)
            : currentValue.minus(totalCost);
        }

        const movement = await tx.stockMovement.create({
          data: {
            tenantId: actor.tenantId,
            productId: line.productId,
            warehouseId: dto.warehouseId,
            type: config.resultType,
            quantity: line.quantity,
            referenceType: dto.referenceType,
            referenceId: dto.referenceId,
            createdBy: actor.userId,
            unitCost,
            totalCost,
            originalMovementId: original.id,
            // Phase 3.6 — only purchase_return_reversal sets this; see
            // RETURN_CONFIG's own comment for the full safety analysis.
            ...(config.setsReversesMovementId
              ? { reversesMovementId: original.id }
              : {}),
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
        referenceType: dto.referenceType,
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
    config: (typeof RETURN_CONFIG)[ReturnReferenceType],
    payloadHash: string,
  ): Promise<StockReturnResult> {
    const existing = await tx.stockReceiptApplication.findFirst({
      where: {
        tenantId: actor.tenantId,
        referenceType: dto.referenceType,
        referenceId: dto.referenceId,
      },
    });
    if (!existing) {
      throw new ConflictException('Return application conflict');
    }
    if (
      existing.payloadHash !== payloadHash ||
      existing.warehouseId !== dto.warehouseId
    ) {
      throw new ConflictException(
        'Return reference already applied with a different payload',
      );
    }
    const movementRows = await tx.stockMovement.findMany({
      where: {
        tenantId: actor.tenantId,
        referenceType: dto.referenceType,
        referenceId: dto.referenceId,
        type: config.resultType,
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
      referenceType: dto.referenceType,
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
