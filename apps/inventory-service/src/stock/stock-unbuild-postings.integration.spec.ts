import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma-client';
import { ActorContext } from '../auth/actor-context';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUnbuildPostingDto } from './dto/stock-unbuild-posting.dto';
import { StockUnbuildPostingsService } from './stock-unbuild-postings.service';

/**
 * Real-PostgreSQL integration tests for StockUnbuildPostingsService —
 * Phase B, Tests C/D/E. Runs against an isolated `inventory_test_db` on the
 * same local Postgres instance used by docker-compose (never the shared
 * dev `inventory_db`). Every fixture row is scoped to one random tenantId
 * created in beforeAll, and afterAll deletes only rows matching it.
 */
const TEST_DATABASE_URL =
  process.env.INVENTORY_TEST_DATABASE_URL ??
  'postgresql://erp:erp_local_only@localhost:15432/inventory_test_db?schema=public';

describe('StockUnbuildPostingsService (integration, real PostgreSQL)', () => {
  let prisma: PrismaService;
  let service: StockUnbuildPostingsService;
  let actor: ActorContext;
  let warehouseId: string;
  let categoryId: string;
  let uomId: string;

  beforeAll(async () => {
    prisma = new PrismaService({
      datasources: { db: { url: TEST_DATABASE_URL } },
    } as never);
    await prisma.$connect();
    service = new StockUnbuildPostingsService(prisma);

    actor = { userId: randomUUID(), tenantId: randomUUID() };

    const category = await prisma.category.create({
      data: { tenantId: actor.tenantId, name: `Unbuild Test Category ${actor.tenantId}` },
    });
    categoryId = category.id;
    const uom = await prisma.unitOfMeasure.create({
      data: { tenantId: actor.tenantId, code: 'EA', name: 'Each' },
    });
    uomId = uom.id;
    const warehouse = await prisma.warehouse.create({
      data: { tenantId: actor.tenantId, code: `WH-${randomUUID().slice(0, 8)}`, name: 'Unbuild Test Warehouse' },
    });
    warehouseId = warehouse.id;
  });

  afterAll(async () => {
    await prisma.stockMovement.deleteMany({ where: { tenantId: actor.tenantId } });
    await prisma.stockReceiptApplication.deleteMany({ where: { tenantId: actor.tenantId } });
    await prisma.stock.deleteMany({ where: { tenantId: actor.tenantId } });
    await prisma.product.deleteMany({ where: { tenantId: actor.tenantId } });
    await prisma.warehouse.deleteMany({ where: { tenantId: actor.tenantId } });
    await prisma.unitOfMeasure.deleteMany({ where: { tenantId: actor.tenantId } });
    await prisma.category.deleteMany({ where: { tenantId: actor.tenantId } });
    await prisma.$disconnect();
  });

  async function createProduct(skuPrefix: string, costPrice: string, initialQty?: string) {
    const product = await prisma.product.create({
      data: {
        tenantId: actor.tenantId,
        sku: `${skuPrefix}-${randomUUID().slice(0, 8)}`,
        name: skuPrefix,
        categoryId,
        unitOfMeasureId: uomId,
        sellingPrice: '10.0000',
        costPrice,
      },
    });
    if (initialQty !== undefined) {
      await prisma.stock.create({
        data: {
          tenantId: actor.tenantId,
          productId: product.id,
          warehouseId,
          quantity: initialQty,
          totalValue: new Prisma.Decimal(initialQty).mul(new Prisma.Decimal(costPrice)).toFixed(4),
        },
      });
    }
    return product;
  }

  async function stockOf(productId: string) {
    return prisma.stock.findFirst({ where: { tenantId: actor.tenantId, productId, warehouseId } });
  }

  it('Test C: concurrent duplicate idempotency references replay the committed result; payload-hash and warehouse mismatches are rejected', async () => {
    const finishedGood = await createProduct('FG', '10.00', '100');
    const component = await createProduct('CMP', '2.00', '0');

    const referenceId = randomUUID();
    const dto: CreateUnbuildPostingDto = {
      referenceType: 'unbuild_order',
      referenceId,
      warehouseId,
      finishedGood: { productId: finishedGood.id, quantity: '5.000000' },
      components: [{ productId: component.id, quantity: '5.000000' }],
    };

    const [r1, r2] = await Promise.all([service.apply(actor, dto), service.apply(actor, dto)]);

    // Postgres's unique constraint on (tenantId, referenceType, referenceId)
    // serializes the two concurrent inserts: exactly one wins the real
    // posting, the other replays the committed result.
    expect([r1.created, r2.created].sort()).toEqual([false, true]);
    expect(r1.finishedGoodsMovement.id).toBe(r2.finishedGoodsMovement.id);
    expect(r1.componentMovements[0].id).toBe(r2.componentMovements[0].id);

    const issueCount = await prisma.stockMovement.count({
      where: { tenantId: actor.tenantId, referenceId, type: 'UNBUILD_ISSUE' },
    });
    const returnCount = await prisma.stockMovement.count({
      where: { tenantId: actor.tenantId, referenceId, type: 'UNBUILD_RETURN' },
    });
    const ledgerCount = await prisma.stockReceiptApplication.count({
      where: { tenantId: actor.tenantId, referenceType: 'unbuild_order', referenceId },
    });
    expect(issueCount).toBe(1);
    expect(returnCount).toBe(1);
    expect(ledgerCount).toBe(1);

    const fgStock = await stockOf(finishedGood.id);
    // Deducted exactly once, not twice, despite two concurrent calls.
    expect(fgStock!.quantity.toFixed(6)).toBe('95.000000');

    // Payload-hash mismatch: same referenceId, different quantity.
    await expect(
      service.apply(actor, {
        ...dto,
        finishedGood: { ...dto.finishedGood, quantity: '6.000000' },
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    // Warehouse mismatch: same referenceId, different warehouse.
    const otherWarehouse = await prisma.warehouse.create({
      data: { tenantId: actor.tenantId, code: `WH2-${randomUUID().slice(0, 8)}`, name: 'Other Warehouse' },
    });
    await expect(
      service.apply(actor, { ...dto, warehouseId: otherWarehouse.id }),
    ).rejects.toBeInstanceOf(ConflictException);

    // Still exactly one ledger row and one movement pair after the rejected replays.
    expect(
      await prisma.stockReceiptApplication.count({
        where: { tenantId: actor.tenantId, referenceType: 'unbuild_order', referenceId },
      }),
    ).toBe(1);
  });

  it('Test D: insufficient finished-goods stock rolls back the entire transaction (including the idempotency ledger), and a corrected retry with the same reference succeeds', async () => {
    const finishedGood = await createProduct('FG', '10.00', '3');
    const component = await createProduct('CMP', '2.00'); // no Stock row at all yet

    const referenceId = randomUUID();
    const dto: CreateUnbuildPostingDto = {
      referenceType: 'unbuild_order',
      referenceId,
      warehouseId,
      finishedGood: { productId: finishedGood.id, quantity: '10.000000' }, // more than the 3 available
      components: [{ productId: component.id, quantity: '10.000000' }],
    };

    await expect(service.apply(actor, dto)).rejects.toBeInstanceOf(ConflictException);

    expect(
      await prisma.stockReceiptApplication.count({
        where: { tenantId: actor.tenantId, referenceType: 'unbuild_order', referenceId },
      }),
    ).toBe(0);
    expect(await prisma.stockMovement.count({ where: { tenantId: actor.tenantId, referenceId } })).toBe(0);

    const fgStockAfterFailure = await stockOf(finishedGood.id);
    expect(fgStockAfterFailure!.quantity.toFixed(6)).toBe('3.000000'); // untouched
    expect(await stockOf(component.id)).toBeNull(); // never created — rollback happened before components were touched

    // Correct the underlying stock issue, then retry the SAME reference.
    await prisma.stock.update({
      where: { id: fgStockAfterFailure!.id },
      data: { quantity: '20', totalValue: '200.0000' },
    });

    const retried = await service.apply(actor, dto);
    expect(retried.created).toBe(true);

    expect(
      await prisma.stockReceiptApplication.count({
        where: { tenantId: actor.tenantId, referenceType: 'unbuild_order', referenceId },
      }),
    ).toBe(1);
    const fgStockAfterRetry = await stockOf(finishedGood.id);
    expect(fgStockAfterRetry!.quantity.toFixed(6)).toBe('10.000000');
    const componentStockAfterRetry = await stockOf(component.id);
    expect(componentStockAfterRetry!.quantity.toFixed(6)).toBe('10.000000');
  });

  it('Test E: crossed finished-good/component stock locks now retry internally — both postings normally succeed, and any remaining failure is a clearly classified exhaustion error, never a raw Prisma error', async () => {
    const productP = await createProduct('P', '5.00', '1000');
    const productQ = await createProduct('Q', '5.00', '1000');

    async function attempt(referenceId: string, fg: typeof productP, component: typeof productQ) {
      return service.apply(actor, {
        referenceType: 'unbuild_order',
        referenceId,
        warehouseId,
        finishedGood: { productId: fg.id, quantity: '1.000000' },
        components: [{ productId: component.id, quantity: '1.000000' }],
      });
    }

    let exhaustionsObserved = 0;
    const ITERATIONS = 15;

    for (let i = 0; i < ITERATIONS; i += 1) {
      const ref1 = randomUUID(); // finished good = P, component = Q
      const ref2 = randomUUID(); // finished good = Q, component = P — reversed roles, same product pair

      const [r1, r2] = await Promise.allSettled([
        attempt(ref1, productP, productQ),
        attempt(ref2, productQ, productP),
      ]);

      const failures = [r1, r2].filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      // Postgres's deadlock detector aborts at most one side of a genuine
      // cycle; it never lets both sides fail from the same deadlock, and
      // never lets both "win" an inconsistent result. apply() now retries
      // a confirmed deadlock internally (bounded, 3 attempts with jittered
      // backoff), so with real Postgres timing this should normally
      // resolve BOTH legs successfully without ever surfacing to the
      // caller — a caller-visible failure now means one leg's own 3
      // internal attempts were all deadlock victims, a much rarer,
      // heavier-tail event than the single-attempt failures Test E
      // originally reproduced on every iteration.
      expect(failures.length).toBeLessThanOrEqual(1);

      for (const failure of failures) {
        exhaustionsObserved += 1;
        const reason = failure.reason;
        // Must be surfaced as a real, identifiable, recoverable error —
        // never a raw/unwrapped Prisma error (P2010, etc.) leaking to the
        // caller, and never silently reported as success.
        expect(reason).toBeInstanceOf(ConflictException);
        expect((reason as ConflictException).getResponse()).toMatchObject({
          code: 'UNBUILD_POSTING_DEADLOCK_EXHAUSTED',
        });
      }

      // Caller-driven retry of whichever leg exhausted its own internal
      // retries — this outer layer (mirroring production-service's
      // isDefiniteRejection()+revertToDraft convention) is what actually
      // guarantees eventual success; the service itself never retries
      // forever.
      if (r1.status === 'rejected') {
        const retried = await attempt(ref1, productP, productQ);
        expect(retried.created).toBe(true);
      }
      if (r2.status === 'rejected') {
        const retried = await attempt(ref2, productQ, productP);
        expect(retried.created).toBe(true);
      }

      // No duplicate posting for either reference regardless of which path was taken.
      expect(
        await prisma.stockMovement.count({
          where: { tenantId: actor.tenantId, referenceId: ref1, type: 'UNBUILD_ISSUE' },
        }),
      ).toBe(1);
      expect(
        await prisma.stockMovement.count({
          where: { tenantId: actor.tenantId, referenceId: ref2, type: 'UNBUILD_ISSUE' },
        }),
      ).toBe(1);
      expect(
        await prisma.stockReceiptApplication.count({
          where: { tenantId: actor.tenantId, referenceId: ref1 },
        }),
      ).toBe(1);
      expect(
        await prisma.stockReceiptApplication.count({
          where: { tenantId: actor.tenantId, referenceId: ref2 },
        }),
      ).toBe(1);
    }

    // Not asserted as a hard requirement — exhaustion (all 3 of one leg's
    // own internal attempts deadlocking) is timing-dependent and expected
    // to be rare now that apply() retries internally. Reported for the
    // record so staging reviewers know whether this run ever reached
    // exhaustion or stayed entirely within the internal-retry path.
    // eslint-disable-next-line no-console
    console.log(
      `[Test E] Caller-visible retry exhaustion observed in ${exhaustionsObserved} of ${ITERATIONS} crossed-lock iterations (internal retry absorbed the rest).`,
    );
  }, 60_000);
});
