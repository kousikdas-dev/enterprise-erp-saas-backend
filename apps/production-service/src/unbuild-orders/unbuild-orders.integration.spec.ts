import { randomUUID } from 'node:crypto';
import { ConflictException, Module, VersioningType } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import { AllExceptionsFilter, ResponseInterceptor } from '@app/common';
import { ActorContext } from '../auth/actor-context';
import { InventoryProductClient } from '../inventory/inventory-product.client';
import { InventoryUnbuildClient } from '../inventory/inventory-unbuild.client';
import { InventoryWarehouseClient } from '../inventory/inventory-warehouse.client';
import { PrismaService } from '../prisma/prisma.service';
import { ProductionEnvironmentVariables } from '../config/production-env';
import { UnbuildOrdersService } from './unbuild-orders.service';

// Cross-service real-PostgreSQL integration tests for Phase B, Tests A/B.
// These tests deliberately reach into inventory-service's own source tree
// (apps/inventory-service/src/...) to boot a REAL, minimal HTTP instance of
// its internal unbuild-postings endpoint, backed by a REAL, isolated
// `inventory_test_db` — because UnbuildOrdersService.complete() genuinely
// makes an HTTP call to that endpoint via InventoryUnbuildClient, and the
// "exactly one inventory posting occurs" assertions below are only
// meaningful if that posting is real. This is test-only wiring; it is not a
// runtime/deployment dependency between the two services' source trees.
import { ActorGuard } from '../../../inventory-service/src/auth/actor.guard';
import { InternalServiceGuard } from '../../../inventory-service/src/auth/internal-service.guard';
import { PrismaService as InventoryPrismaService } from '../../../inventory-service/src/prisma/prisma.service';
import { InternalStockUnbuildPostingsController } from '../../../inventory-service/src/stock/internal-stock-unbuild-postings.controller';
import { StockUnbuildPostingsService } from '../../../inventory-service/src/stock/stock-unbuild-postings.service';

const PRODUCTION_TEST_DATABASE_URL =
  process.env.PRODUCTION_TEST_DATABASE_URL ??
  'postgresql://erp:erp_local_only@localhost:15432/production_test_db?schema=public';
const INVENTORY_TEST_DATABASE_URL =
  process.env.INVENTORY_TEST_DATABASE_URL ??
  'postgresql://erp:erp_local_only@localhost:15432/inventory_test_db?schema=public';
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET ?? 'test-internal-service-secret';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
  controllers: [InternalStockUnbuildPostingsController],
  // InventoryPrismaService is declared here only so overrideProvider() below
  // has a token to replace — it is never actually instantiated with its
  // real (zero-arg) constructor; the real, already-connected instance
  // pointed at inventory_test_db is substituted before the module compiles.
  providers: [StockUnbuildPostingsService, InternalServiceGuard, ActorGuard, InventoryPrismaService],
})
class TestInventoryAppModule {}

async function startRealInventoryTestApp(inventoryPrisma: InventoryPrismaService): Promise<{
  app: INestApplication;
  baseUrl: string;
}> {
  const moduleRef = await (
    await import('@nestjs/testing')
  ).Test.createTestingModule({
    imports: [TestInventoryAppModule],
  })
    .overrideProvider(InventoryPrismaService)
    .useValue(inventoryPrisma)
    .compile();

  const app = moduleRef.createNestApplication();
  // Mirrors bootstrapHttpApp's real prefix/versioning/envelope exactly, since
  // InventoryUnbuildClient hard-codes the resulting `/api/v1/...` path and
  // expects the `{ data }` success envelope.
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  await app.listen(0);
  const address = app.getHttpServer().address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return { app, baseUrl };
}

describe('UnbuildOrdersService (integration, real PostgreSQL + real cross-service HTTP posting)', () => {
  let prisma: PrismaService;
  let inventoryPrisma: InventoryPrismaService;
  let inventoryApp: INestApplication;
  let service: UnbuildOrdersService;
  let tenantId: string;
  let categoryId: string;
  let uomId: string;

  beforeAll(async () => {
    prisma = new PrismaService({
      datasources: { db: { url: PRODUCTION_TEST_DATABASE_URL } },
    } as never);
    await prisma.$connect();

    inventoryPrisma = new InventoryPrismaService({
      datasources: { db: { url: INVENTORY_TEST_DATABASE_URL } },
    } as never);
    await inventoryPrisma.$connect();

    const { app, baseUrl } = await startRealInventoryTestApp(inventoryPrisma);
    inventoryApp = app;

    const fakeConfig = {
      get: (key: string) =>
        ({
          INVENTORY_SERVICE_URL: baseUrl,
          INTERNAL_SERVICE_SECRET: INTERNAL_SECRET,
        })[key],
    } as unknown as ConfigService<ProductionEnvironmentVariables, true>;

    const http = new HttpService();
    const inventoryUnbuildClient = new InventoryUnbuildClient(http, fakeConfig);

    // Product/warehouse "detail" lookups are read straight out of the real
    // inventory_test_db fixture rows below — only the HTTP transport is
    // stubbed. These two clients are irrelevant to the concurrency
    // mechanisms under test (claimProcessing/update guard/idempotency);
    // what matters is that complete()'s actual posting call
    // (InventoryUnbuildClient) is wired to the real HTTP+DB path above.
    const fakeProductClient = {
      getProductDetail: async (_actor: ActorContext, productId: string) => {
        const product = await inventoryPrisma.product.findFirstOrThrow({ where: { id: productId } });
        return {
          id: product.id,
          sku: product.sku,
          name: product.name,
          isActive: product.isActive,
          trackInventory: product.trackInventory,
          productType: product.productType,
          categoryId: product.categoryId,
          unitOfMeasureId: product.unitOfMeasureId,
          templateProductId: product.templateProductId,
          base: { unitOfMeasureId: product.unitOfMeasureId, code: 'EA', name: 'Each' },
          alternatives: [],
        };
      },
    } as unknown as InventoryProductClient;

    const fakeWarehouseClient = {
      getWarehouseDetail: async (_actor: ActorContext, warehouseId: string) => {
        const warehouse = await inventoryPrisma.warehouse.findFirstOrThrow({ where: { id: warehouseId } });
        return { id: warehouse.id, code: warehouse.code, name: warehouse.name, isActive: warehouse.isActive };
      },
    } as unknown as InventoryWarehouseClient;

    service = new UnbuildOrdersService(
      prisma,
      fakeProductClient,
      fakeWarehouseClient,
      inventoryUnbuildClient,
    );

    tenantId = randomUUID();

    const category = await inventoryPrisma.category.create({
      data: { tenantId, name: `Unbuild Integration Category ${tenantId}` },
    });
    categoryId = category.id;
    const uom = await inventoryPrisma.unitOfMeasure.create({
      data: { tenantId, code: 'EA', name: 'Each' },
    });
    uomId = uom.id;
  });

  afterAll(async () => {
    await inventoryPrisma.stockMovement.deleteMany({ where: { tenantId } });
    await inventoryPrisma.stockReceiptApplication.deleteMany({ where: { tenantId } });
    await inventoryPrisma.stock.deleteMany({ where: { tenantId } });
    await inventoryPrisma.product.deleteMany({ where: { tenantId } });
    await inventoryPrisma.warehouse.deleteMany({ where: { tenantId } });
    await inventoryPrisma.unitOfMeasure.deleteMany({ where: { tenantId } });
    await inventoryPrisma.category.deleteMany({ where: { tenantId } });

    await prisma.unbuildOrderItem.deleteMany({ where: { tenantId } });
    await prisma.unbuildOrder.deleteMany({ where: { tenantId } });
    await prisma.bomItem.deleteMany({ where: { tenantId } });
    await prisma.bom.deleteMany({ where: { tenantId } });

    await inventoryApp.close();
    await inventoryPrisma.$disconnect();
    await prisma.$disconnect();
  });

  /**
   * Builds one finished-good product + one component product (both with
   * ample Stock in inventory_test_db), one ACTIVE Bom + BomItem in
   * production_test_db, and one DRAFT UnbuildOrder + UnbuildOrderItem
   * inserted directly (bypassing create()'s own HTTP validation, which is
   * out of scope for these concurrency tests).
   */
  async function createFixture(options: { quantity: string; componentQty: string }) {
    const actor: ActorContext = { userId: randomUUID(), tenantId };
    const warehouse = await inventoryPrisma.warehouse.create({
      data: { tenantId, code: `WH-${randomUUID().slice(0, 8)}`, name: 'Integration Warehouse' },
    });
    const finishedGood = await inventoryPrisma.product.create({
      data: {
        tenantId,
        sku: `FG-${randomUUID().slice(0, 8)}`,
        name: 'Finished Good',
        categoryId,
        unitOfMeasureId: uomId,
        sellingPrice: '50.0000',
        costPrice: '20.0000',
      },
    });
    const component = await inventoryPrisma.product.create({
      data: {
        tenantId,
        sku: `CMP-${randomUUID().slice(0, 8)}`,
        name: 'Component',
        categoryId,
        unitOfMeasureId: uomId,
        sellingPrice: '10.0000',
        costPrice: '5.0000',
      },
    });
    await inventoryPrisma.stock.create({
      data: {
        tenantId,
        productId: finishedGood.id,
        warehouseId: warehouse.id,
        // Seeded with ample headroom (independent of the order's own
        // quantity) so an update() that raises the order's quantity before
        // completion never spuriously fails on "insufficient stock" — that
        // failure mode is covered separately and deliberately by Test D.
        quantity: '1000',
        totalValue: '20000.0000',
      },
    });

    const bom = await prisma.bom.create({
      data: {
        tenantId,
        parentProductId: finishedGood.id,
        parentProductSku: finishedGood.sku,
        parentProductName: finishedGood.name,
        bomQuantity: options.quantity,
        outputUnitOfMeasureId: uomId,
        outputUomCode: 'EA',
        outputUomName: 'Each',
        version: 1,
        status: 'ACTIVE',
      },
    });
    await prisma.bomItem.create({
      data: {
        tenantId,
        bomId: bom.id,
        componentProductId: component.id,
        componentProductSku: component.sku,
        componentProductName: component.name,
        quantity: options.componentQty,
        unitOfMeasureId: uomId,
        uomCode: 'EA',
        uomName: 'Each',
        sequence: 1,
      },
    });

    const order = await prisma.unbuildOrder.create({
      data: {
        tenantId,
        orderNumber: `UB-TEST-${randomUUID().slice(0, 8)}`,
        productId: finishedGood.id,
        productSku: finishedGood.sku,
        productName: finishedGood.name,
        bomId: bom.id,
        bomVersion: bom.version,
        quantity: options.quantity,
        unitOfMeasureId: uomId,
        uomCode: 'EA',
        uomName: 'Each',
        warehouseId: warehouse.id,
        status: 'DRAFT',
        unbuildDate: new Date(),
        items: {
          create: [
            {
              tenantId,
              componentProductId: component.id,
              componentProductSku: component.sku,
              componentProductName: component.name,
              quantity: options.componentQty,
              unitOfMeasureId: uomId,
              uomCode: 'EA',
              uomName: 'Each',
              sequence: 1,
            },
          ],
        },
      },
    });

    return { actor, orderId: order.id, warehouseId: warehouse.id, finishedGoodId: finishedGood.id, componentId: component.id };
  }

  it('Test A: two concurrent completion requests for the same order result in exactly one inventory posting and a consistent final state', async () => {
    const TRIALS = 5;
    for (let i = 0; i < TRIALS; i += 1) {
      const fx = await createFixture({ quantity: '10', componentQty: '2' });

      const [r1, r2] = await Promise.allSettled([
        service.complete(fx.actor, fx.orderId),
        service.complete(fx.actor, fx.orderId),
      ]);

      const fulfilled = [r1, r2].filter((r) => r.status === 'fulfilled');
      const rejected = [r1, r2].filter((r): r is PromiseRejectedResult => r.status === 'rejected');

      // claimProcessing's atomic updateMany is a single UPDATE statement on
      // one row: real Postgres row locking guarantees exactly one of the
      // two concurrent claims can ever see status='DRAFT', so exactly one
      // request proceeds to post and exactly one is rejected immediately,
      // never reaching the posting call at all.
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect(rejected[0].reason).toBeInstanceOf(ConflictException);

      const order = await prisma.unbuildOrder.findFirstOrThrow({
        where: { id: fx.orderId },
        include: { items: true },
      });
      expect(order.status).toBe('DONE');
      expect(order.finishedGoodsMovementId).toBeTruthy();
      for (const item of order.items) {
        expect(item.stockMovementId).toBeTruthy();
      }

      const issueCount = await inventoryPrisma.stockMovement.count({
        where: { tenantId, referenceId: fx.orderId, type: 'UNBUILD_ISSUE' },
      });
      const returnCount = await inventoryPrisma.stockMovement.count({
        where: { tenantId, referenceId: fx.orderId, type: 'UNBUILD_RETURN' },
      });
      const ledgerCount = await inventoryPrisma.stockReceiptApplication.count({
        where: { tenantId, referenceType: 'unbuild_order', referenceId: fx.orderId },
      });
      // Exactly one inventory posting — no duplicate finished-goods issue or component return.
      expect(issueCount).toBe(1);
      expect(returnCount).toBe(1);
      expect(ledgerCount).toBe(1);
    }
  });

  it('Test B: update() racing with the completion claim resolves to exactly one consistent outcome, with no item mutation after a completion claim, across both real orderings', async () => {
    const TRIALS = 20;
    let updateWon = 0;
    let completeWon = 0;

    for (let i = 0; i < TRIALS; i += 1) {
      const fx = await createFixture({ quantity: '10', componentQty: '2' });

      const [updateResult, completeResult] = await Promise.allSettled([
        service.update(fx.actor, fx.orderId, { quantity: '20' }),
        service.complete(fx.actor, fx.orderId),
      ]);

      const order = await prisma.unbuildOrder.findFirstOrThrow({
        where: { id: fx.orderId },
        include: { items: true },
      });

      if (updateResult.status === 'fulfilled') {
        updateWon += 1;
        // update() committed its guarded change before the completion claim:
        // complete() must still succeed, now posting the UPDATED quantity.
        expect(completeResult.status).toBe('fulfilled');
        expect(order.quantity.toFixed(6)).toBe('20.000000');
        expect(order.items).toHaveLength(1);
        expect(order.items[0].quantity.toFixed(6)).toBe('4.000000'); // 2x scale from quantity 10->20
      } else {
        completeWon += 1;
        // Completion claimed the order first: update()'s atomic guard must
        // see status != DRAFT and fail — and critically, it must never have
        // deleted/recreated the original item rows after that claim.
        expect(updateResult.reason).toBeInstanceOf(ConflictException);
        expect(completeResult.status).toBe('fulfilled');
        expect(order.quantity.toFixed(6)).toBe('10.000000');
        expect(order.items).toHaveLength(1);
        expect(order.items[0].quantity.toFixed(6)).toBe('2.000000');
      }

      expect(order.status).toBe('DONE');
      expect(order.finishedGoodsMovementId).toBeTruthy();
      for (const item of order.items) {
        expect(item.stockMovementId).toBeTruthy();
      }
    }

    // eslint-disable-next-line no-console
    console.log(`[Test B] update-won: ${updateWon}, complete-won: ${completeWon} of ${TRIALS} real-timing trials`);
    expect(updateWon + completeWon).toBe(TRIALS);
  });

  it('Test B (ordering 2, deterministic): an update() that commits its guard before any completion claim lets the subsequent complete() succeed and post the updated data', async () => {
    // The concurrent trial above exercises real Postgres row-locking to
    // decide which ordering occurs — and in this codebase, complete()'s
    // claimProcessing() is a single UPDATE statement with no prior async
    // work, while update() must first read the BOM before reaching its own
    // guarded UPDATE, so complete() reliably won every real-timing trial.
    // This sequential test exercises the OTHER ordering with the same real
    // database transactions and the same atomic-guard code path, just
    // without leaving the outcome to timing.
    const fx = await createFixture({ quantity: '10', componentQty: '2' });

    const updated = await service.update(fx.actor, fx.orderId, { quantity: '20' });
    expect(updated.quantity).toBe('20.000000');

    const completed = await service.complete(fx.actor, fx.orderId);
    expect(completed.status).toBe('DONE');

    const order = await prisma.unbuildOrder.findFirstOrThrow({
      where: { id: fx.orderId },
      include: { items: true },
    });
    expect(order.quantity.toFixed(6)).toBe('20.000000');
    expect(order.items).toHaveLength(1);
    // Posting used the UPDATED (2x-scaled) component quantity, not the
    // original DRAFT snapshot.
    expect(order.items[0].quantity.toFixed(6)).toBe('4.000000');
    expect(order.finishedGoodsMovementId).toBeTruthy();
    expect(order.items[0].stockMovementId).toBeTruthy();

    const returnMovement = await inventoryPrisma.stockMovement.findFirstOrThrow({
      where: { tenantId, referenceId: fx.orderId, type: 'UNBUILD_RETURN' },
    });
    expect(returnMovement.quantity.toFixed(6)).toBe('4.000000');
  });
});
