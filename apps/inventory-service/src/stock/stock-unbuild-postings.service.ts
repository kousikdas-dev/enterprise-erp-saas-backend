import { setTimeout as sleep } from 'node:timers/promises';
import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StockMovementType } from '../../generated/prisma-client';
import { ActorContext } from '../auth/actor-context';
import {
  moneyToString,
  parsePositiveDecimal,
  quantityToString,
} from '../common/decimal';
import { isTransactionDeadlockError } from '../prisma/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateUnbuildPostingDto,
  unbuildPostingPayloadHash,
} from './dto/stock-unbuild-posting.dto';

const REFERENCE_TYPE = 'unbuild_order';
// Bounded retry for a confirmed Postgres deadlock/serialization abort of the
// posting transaction (see isTransactionDeadlockError) — never for business
// exceptions, validation errors, or any other database failure. A deadlock
// abort rolls back the whole transaction (Postgres's own guarantee), so
// retrying the identical dto/referenceId on the next attempt is a plain
// fresh attempt, not a replay-collision.
const MAX_DEADLOCK_ATTEMPTS = 3;
const DEADLOCK_RETRY_BASE_DELAY_MS = 20;
const DEADLOCK_RETRY_JITTER_MS = 20;

export interface UnbuildPostingMovement {
  id: string;
  productId: string;
  quantity: string;
  unitCost: string;
  totalCost: string;
}

export interface UnbuildPostingResult {
  created: boolean;
  referenceType: string;
  referenceId: string;
  warehouseId: string;
  finishedGoodsMovement: UnbuildPostingMovement;
  componentMovements: UnbuildPostingMovement[];
}

interface ParsedLine {
  productId: string;
  quantity: Prisma.Decimal;
}

type MovementRow = {
  id: string;
  productId: string;
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal | null;
  totalCost: Prisma.Decimal | null;
};

/**
 * Posts the atomic, idempotent stock effect of completing an Unbuild Order:
 * one UNBUILD_ISSUE (finished good, subtractive) paired with one or more
 * UNBUILD_RETURN movements (components, additive), all inside a single
 * transaction, sharing the same stock_receipt_applications idempotency
 * ledger StockReceiptsService/StockIssuesService already use (keyed by
 * referenceType='unbuild_order' instead of 'goods_receipt'/'shipment').
 *
 * Valuation: the finished good is costed by the exact StockIssuesService
 * moving-average formula (current Stock.totalValue / Stock.quantity,
 * snapshotted under the row lock — never client-supplied). That removed
 * value is then allocated across every component line, weighted by
 * componentQty × Product.costPrice, floor-rounded to 4dp with the residual
 * on the last line — see unbuild-order design report, "Inventory
 * valuation" and "Zero/invalid component cost-price weights" sections, for
 * why this is non-negative and conserves value exactly.
 */
@Injectable()
export class StockUnbuildPostingsService {
  constructor(private readonly prisma: PrismaService) {}

  async apply(
    actor: ActorContext,
    dto: CreateUnbuildPostingDto,
  ): Promise<UnbuildPostingResult> {
    if (dto.referenceType !== REFERENCE_TYPE) {
      throw new ConflictException('Unsupported referenceType');
    }
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, tenantId: actor.tenantId },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    const finishedGood: ParsedLine = {
      productId: dto.finishedGood.productId,
      quantity: parsePositiveDecimal(dto.finishedGood.quantity),
    };
    const components: ParsedLine[] = dto.components.map((line) => ({
      productId: line.productId,
      quantity: parsePositiveDecimal(line.quantity),
    }));

    const finishedGoodProduct = await this.prisma.product.findFirst({
      where: { id: finishedGood.productId, tenantId: actor.tenantId },
    });
    if (!finishedGoodProduct) throw new NotFoundException('Product not found');

    const payloadHash = unbuildPostingPayloadHash({
      warehouseId: dto.warehouseId,
      finishedGood: {
        productId: finishedGood.productId,
        quantity: quantityToString(finishedGood.quantity),
      },
      components: components.map((line) => ({
        productId: line.productId,
        quantity: quantityToString(line.quantity),
      })),
    });

    for (let attempt = 1; attempt <= MAX_DEADLOCK_ATTEMPTS; attempt += 1) {
      try {
        return await this.runPostingTransaction(
          actor,
          dto,
          finishedGood,
          components,
          payloadHash,
        );
      } catch (error) {
        if (!isTransactionDeadlockError(error)) {
          // Business exception, validation error, or any other database
          // failure — never retried, propagated as-is.
          throw error;
        }
        if (attempt === MAX_DEADLOCK_ATTEMPTS) {
          throw new ConflictException({
            code: 'UNBUILD_POSTING_DEADLOCK_EXHAUSTED',
            message:
              'Unbuild posting could not be applied after repeated transaction deadlocks; please retry',
          });
        }
        // Postgres has already rolled back the entire failed transaction
        // (including the idempotency-ledger insert) before this catch
        // runs — retrying the identical dto/referenceId below is a plain
        // fresh attempt, never a replay of something that partially committed.
        await sleep(
          DEADLOCK_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) +
            Math.floor(Math.random() * DEADLOCK_RETRY_JITTER_MS),
        );
      }
    }
    // Unreachable: MAX_DEADLOCK_ATTEMPTS >= 1, and the loop above always
    // either returns or throws on its final iteration.
    throw new ConflictException({
      code: 'UNBUILD_POSTING_DEADLOCK_EXHAUSTED',
      message: 'Unbuild posting could not be applied after repeated transaction deadlocks; please retry',
    });
  }

  private async runPostingTransaction(
    actor: ActorContext,
    dto: CreateUnbuildPostingDto,
    finishedGood: ParsedLine,
    components: ParsedLine[],
    payloadHash: string,
  ): Promise<UnbuildPostingResult> {
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
        return this.replayExisting(tx, actor, dto, finishedGood, components, payloadHash);
      }

      // Lock order: finished good first, then components sorted by
      // productId ascending. This only prevents deadlocks between postings
      // that agree on which product is the finished good (e.g. two
      // concurrent Unbuilds of the same finished good, or an overlapping
      // component set posted in the same role). It does NOT prevent a
      // deadlock when two postings post the SAME pair of products with
      // swapped roles (A's finished good is B's component and vice versa)
      // — each posting still locks its own finished good first, so the two
      // fixed orders are reversed relative to each other. That residual
      // case is real (confirmed by a real-PostgreSQL crossed-lock
      // regression test) and is handled by apply()'s bounded deadlock
      // retry above, not by lock ordering.
      const fgLocked = await tx.$queryRaw<
        Array<{ id: string; quantity: Prisma.Decimal; totalValue: Prisma.Decimal }>
      >(
        Prisma.sql`SELECT id, quantity, "totalValue" FROM stocks WHERE "tenantId" = ${actor.tenantId}::uuid AND "productId" = ${finishedGood.productId}::uuid AND "warehouseId" = ${dto.warehouseId}::uuid FOR UPDATE`,
      );
      if (!fgLocked[0]) {
        throw new ConflictException('Insufficient stock');
      }
      const fgCurrentQty = new Prisma.Decimal(fgLocked[0].quantity.toString());
      const fgCurrentValue = new Prisma.Decimal(fgLocked[0].totalValue.toString());
      const fgNextQty = fgCurrentQty.minus(finishedGood.quantity);
      if (fgNextQty.lt(0)) {
        throw new ConflictException('Insufficient stock');
      }
      // Exact mirror of StockIssuesService's issue formula: cost is always
      // the current moving average, snapshotted under this lock.
      const fgUnitCost = fgCurrentQty.gt(0)
        ? fgCurrentValue.div(fgCurrentQty)
        : new Prisma.Decimal(0);
      const fgTotalCost = finishedGood.quantity.mul(fgUnitCost);
      const fgNextValue = fgNextQty.eq(0)
        ? new Prisma.Decimal(0)
        : fgCurrentValue.minus(fgTotalCost);

      const fgMovement = await tx.stockMovement.create({
        data: {
          tenantId: actor.tenantId,
          productId: finishedGood.productId,
          warehouseId: dto.warehouseId,
          type: StockMovementType.UNBUILD_ISSUE,
          quantity: finishedGood.quantity,
          referenceType: REFERENCE_TYPE,
          referenceId: dto.referenceId,
          createdBy: actor.userId,
          unitCost: fgUnitCost,
          totalCost: fgTotalCost,
        },
      });
      await tx.stock.update({
        where: { id: fgLocked[0].id },
        data: { quantity: fgNextQty, totalValue: fgNextValue },
      });

      const sortedComponents = [...components].sort((a, b) =>
        a.productId.localeCompare(b.productId),
      );

      const weights: Array<{ productId: string; quantity: Prisma.Decimal; weight: Prisma.Decimal }> =
        [];
      for (const line of sortedComponents) {
        const product = await tx.product.findFirst({
          where: { id: line.productId, tenantId: actor.tenantId },
          select: { costPrice: true },
        });
        if (!product) throw new NotFoundException('Product not found');
        weights.push({
          productId: line.productId,
          quantity: line.quantity,
          weight: line.quantity.mul(product.costPrice),
        });
      }
      const totalWeight = weights.reduce(
        (sum, w) => sum.plus(w.weight),
        new Prisma.Decimal(0),
      );
      // Every component has a zero costPrice weight (e.g. no standard cost
      // assigned) — fall back to an equal split rather than leaving the
      // finished good's removed value unallocated.
      const effectiveWeights = totalWeight.gt(0)
        ? weights
        : weights.map((w) => ({ ...w, weight: new Prisma.Decimal(1) }));
      const effectiveTotalWeight = totalWeight.gt(0)
        ? totalWeight
        : new Prisma.Decimal(weights.length);

      // Floor every non-last share to 4dp (Decimal(19,4) precision) and plug
      // the exact residual onto the last line. Flooring is monotonically
      // <= the true share, so the residual is provably >= the true last
      // share, i.e. >= 0 — see design report §1 for the proof. Order is
      // fixed (sortedComponents) so "last" is deterministic.
      const shares: Prisma.Decimal[] = [];
      let allocated = new Prisma.Decimal(0);
      for (let i = 0; i < effectiveWeights.length; i += 1) {
        if (i === effectiveWeights.length - 1) {
          shares.push(fgTotalCost.minus(allocated));
          break;
        }
        const raw = fgTotalCost.mul(effectiveWeights[i].weight).div(effectiveTotalWeight);
        const floored = raw.toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN);
        shares.push(floored);
        allocated = allocated.plus(floored);
      }

      const componentMovementsByProductId = new Map<string, UnbuildPostingMovement>();
      for (let i = 0; i < sortedComponents.length; i += 1) {
        const line = sortedComponents[i];
        const share = shares[i];
        const locked = await tx.$queryRaw<
          Array<{ id: string; quantity: Prisma.Decimal; totalValue: Prisma.Decimal }>
        >(
          Prisma.sql`SELECT id, quantity, "totalValue" FROM stocks WHERE "tenantId" = ${actor.tenantId}::uuid AND "productId" = ${line.productId}::uuid AND "warehouseId" = ${dto.warehouseId}::uuid FOR UPDATE`,
        );
        const currentQty = locked[0]
          ? new Prisma.Decimal(locked[0].quantity.toString())
          : new Prisma.Decimal(0);
        const currentValue = locked[0]
          ? new Prisma.Decimal(locked[0].totalValue.toString())
          : new Prisma.Decimal(0);
        const nextQty = currentQty.plus(line.quantity);
        const nextValue = currentValue.plus(share);
        const unitCost = line.quantity.gt(0)
          ? share.div(line.quantity)
          : new Prisma.Decimal(0);

        const movement = await tx.stockMovement.create({
          data: {
            tenantId: actor.tenantId,
            productId: line.productId,
            warehouseId: dto.warehouseId,
            type: StockMovementType.UNBUILD_RETURN,
            quantity: line.quantity,
            referenceType: REFERENCE_TYPE,
            referenceId: dto.referenceId,
            createdBy: actor.userId,
            unitCost,
            totalCost: share,
          },
        });
        if (locked[0]) {
          await tx.stock.update({
            where: { id: locked[0].id },
            data: { quantity: nextQty, totalValue: nextValue },
          });
        } else {
          await tx.stock.create({
            data: {
              tenantId: actor.tenantId,
              productId: line.productId,
              warehouseId: dto.warehouseId,
              quantity: nextQty,
              totalValue: nextValue,
            },
          });
        }
        componentMovementsByProductId.set(line.productId, this.toMovement(movement));
      }

      return {
        created: true,
        referenceType: REFERENCE_TYPE,
        referenceId: dto.referenceId,
        warehouseId: dto.warehouseId,
        finishedGoodsMovement: this.toMovement(fgMovement),
        // Output order follows the original request order, not the sorted
        // lock order and not DB return order.
        componentMovements: components.map(
          (line) => componentMovementsByProductId.get(line.productId)!,
        ),
      };
    });
  }

  /**
   * Identity-based replay validation: queries by (type, referenceId) with no
   * orderBy this result depends on, then partitions and verifies by
   * (type, productId) before returning anything — never trusts createdAt or
   * unspecified DB row order (see design report, "replayExisting()
   * determinism"). A mismatch here means data corruption, not a normal
   * retry, so it fails loudly rather than returning an unverified replay.
   */
  private async replayExisting(
    tx: Prisma.TransactionClient,
    actor: ActorContext,
    dto: CreateUnbuildPostingDto,
    finishedGood: ParsedLine,
    components: ParsedLine[],
    payloadHash: string,
  ): Promise<UnbuildPostingResult> {
    const existing = await tx.stockReceiptApplication.findFirst({
      where: {
        tenantId: actor.tenantId,
        referenceType: REFERENCE_TYPE,
        referenceId: dto.referenceId,
      },
    });
    if (!existing) {
      throw new ConflictException('Unbuild posting application conflict');
    }
    if (existing.payloadHash !== payloadHash || existing.warehouseId !== dto.warehouseId) {
      throw new ConflictException(
        'Unbuild order reference already applied with a different payload',
      );
    }

    const rows = await tx.stockMovement.findMany({
      where: {
        tenantId: actor.tenantId,
        referenceType: REFERENCE_TYPE,
        referenceId: dto.referenceId,
        type: { in: [StockMovementType.UNBUILD_ISSUE, StockMovementType.UNBUILD_RETURN] },
      },
    });
    const issueRows = rows.filter((row) => row.type === StockMovementType.UNBUILD_ISSUE);
    const returnRows = rows.filter((row) => row.type === StockMovementType.UNBUILD_RETURN);

    if (issueRows.length !== 1 || issueRows[0].productId !== finishedGood.productId) {
      throw new InternalServerErrorException({
        code: 'UNBUILD_POSTING_INTEGRITY_ERROR',
        message:
          'Unbuild posting replay could not find exactly one matching finished-goods movement',
      });
    }

    const expectedProductIds = new Set(components.map((line) => line.productId));
    const returnByProductId = new Map(returnRows.map((row) => [row.productId, row]));
    const countsMatch = returnRows.length === components.length;
    const everyExpectedFound = [...expectedProductIds].every((id) => returnByProductId.has(id));
    const noUnexpectedExtra = returnRows.every((row) => expectedProductIds.has(row.productId));
    if (!countsMatch || !everyExpectedFound || !noUnexpectedExtra) {
      throw new InternalServerErrorException({
        code: 'UNBUILD_POSTING_INTEGRITY_ERROR',
        message:
          'Unbuild posting replay could not find the expected set of component movements',
      });
    }

    return {
      created: false,
      referenceType: REFERENCE_TYPE,
      referenceId: dto.referenceId,
      warehouseId: dto.warehouseId,
      finishedGoodsMovement: this.toMovement(issueRows[0]),
      componentMovements: components.map((line) =>
        this.toMovement(returnByProductId.get(line.productId)!),
      ),
    };
  }

  private toMovement(row: MovementRow): UnbuildPostingMovement {
    return {
      id: row.id,
      productId: row.productId,
      quantity: quantityToString(row.quantity),
      unitCost: row.unitCost ? moneyToString(row.unitCost) : moneyToString(new Prisma.Decimal(0)),
      totalCost: row.totalCost
        ? moneyToString(row.totalCost)
        : moneyToString(new Prisma.Decimal(0)),
    };
  }
}
