import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma-client';
import { ProductionOrdersService } from './production-orders.service';

describe('ProductionOrdersService', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const otherTenant = 'bbbbbbbb-aaaa-4aaa-8aaa-bbbbbbbbbbbb';

  const productId = 'p1111111-aaaa-4aaa-8aaa-p11111111111';
  const bomId = 'bom11111-aaaa-4aaa-8aaa-bom111111111';
  const baseUnitId = 'u3333333-aaaa-4aaa-8aaa-u33333333333';
  const altUnitId = 'u4444444-aaaa-4aaa-8aaa-u44444444444';
  const warehouseId = 'w1111111-aaaa-4aaa-8aaa-w11111111111';
  const orderId = 'mo111111-aaaa-4aaa-8aaa-mo1111111111';

  function productDetail(overrides: Record<string, unknown> = {}) {
    return {
      id: productId,
      sku: 'YARN-40S',
      name: 'Cotton Yarn 40s',
      isActive: true,
      trackInventory: true,
      productType: 'GOODS',
      categoryId: 'cat11111-aaaa-4aaa-8aaa-cat111111111',
      unitOfMeasureId: baseUnitId,
      base: { unitOfMeasureId: baseUnitId, code: 'KG', name: 'Kilogram' },
      alternatives: [
        {
          unitOfMeasureId: altUnitId,
          code: 'G',
          name: 'Gram',
          conversionFactor: '1000.000000',
          sellingPrice: '0.5000',
        },
      ],
      ...overrides,
    };
  }

  function bomRow(overrides: Record<string, unknown> = {}) {
    return {
      id: bomId,
      tenantId: actor.tenantId,
      parentProductId: productId,
      parentProductSku: 'YARN-40S',
      parentProductName: 'Cotton Yarn 40s',
      bomQuantity: new Prisma.Decimal('100.000000'),
      outputUnitOfMeasureId: baseUnitId,
      outputUomCode: 'KG',
      outputUomName: 'Kilogram',
      version: 2,
      status: 'ACTIVE',
      effectiveFrom: null,
      effectiveTo: null,
      notes: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      ...overrides,
    };
  }

  function orderRow(overrides: Record<string, unknown> = {}) {
    return {
      id: orderId,
      tenantId: actor.tenantId,
      orderNumber: 'MO-000001',
      productId,
      productSku: 'YARN-40S',
      productName: 'Cotton Yarn 40s',
      bomId,
      bomVersion: 2,
      routingId: null,
      routingVersion: null,
      plannedQuantity: new Prisma.Decimal('1000.000000'),
      outputUnitOfMeasureId: baseUnitId,
      outputUomCode: 'KG',
      outputUomName: 'Kilogram',
      orderDate: new Date('2026-09-30'),
      plannedStartDate: null,
      plannedEndDate: null,
      warehouseId: null,
      priority: 'NORMAL',
      status: 'DRAFT',
      notes: null,
      createdAt: new Date('2026-09-30'),
      updatedAt: new Date('2026-09-30'),
      ...overrides,
    };
  }

  function createDto(overrides: Record<string, unknown> = {}) {
    return {
      productId,
      bomId,
      plannedQuantity: '1000',
      outputUnitOfMeasureId: baseUnitId,
      orderDate: '2026-09-30',
      ...overrides,
    };
  }

  function basePrisma(overrides: Record<string, unknown> = {}) {
    const prisma = {
      productionOrder: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        delete: jest.fn(),
      },
      bom: {
        findFirst: jest.fn().mockResolvedValue(bomRow()),
      },
      ...overrides,
    };
    (prisma as unknown as { $transaction: jest.Mock }).$transaction = jest.fn(
      (arg: unknown) => {
        if (Array.isArray(arg)) return Promise.all(arg);
        return (arg as (tx: typeof prisma) => unknown)(prisma);
      },
    );
    return prisma;
  }

  function defaultInventoryProducts(overrides: Record<string, unknown> = {}) {
    return {
      getProductDetail: jest.fn().mockResolvedValue(productDetail()),
      ...overrides,
    };
  }

  function defaultInventoryWarehouses(overrides: Record<string, unknown> = {}) {
    return {
      getWarehouseDetail: jest.fn().mockResolvedValue({
        id: warehouseId,
        code: 'FACTORY',
        name: 'Factory',
        isActive: true,
      }),
      ...overrides,
    };
  }

  function service(
    prisma = basePrisma(),
    inventoryProducts = defaultInventoryProducts(),
    inventoryWarehouses = defaultInventoryWarehouses(),
  ) {
    return {
      svc: new ProductionOrdersService(
        prisma as never,
        inventoryProducts as never,
        inventoryWarehouses as never,
      ),
      prisma,
      inventoryProducts,
      inventoryWarehouses,
    };
  }

  describe('create', () => {
    it('creates a DRAFT production order with a server-generated order number, snapshotting product/BOM/output UOM', async () => {
      const prisma = basePrisma();
      prisma.productionOrder.count.mockResolvedValue(0);
      prisma.productionOrder.create.mockResolvedValue(orderRow());
      const { svc } = service(prisma);

      const result = await svc.create(actor, createDto());

      expect(prisma.productionOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: actor.tenantId,
            orderNumber: 'MO-000001',
            productId,
            productSku: 'YARN-40S',
            productName: 'Cotton Yarn 40s',
            bomId,
            bomVersion: 2,
            routingId: null,
            routingVersion: null,
            outputUnitOfMeasureId: baseUnitId,
            outputUomCode: 'KG',
            outputUomName: 'Kilogram',
            status: 'DRAFT',
            priority: 'NORMAL',
          }),
        }),
      );
      expect(result.orderNumber).toBe('MO-000001');
      expect(result.status).toBe('DRAFT');
      expect(result.plannedQuantity).toBe('1000.000000');
      expect(result.productSku).toBe('YARN-40S');
      expect(result.outputUomCode).toBe('KG');
    });

    it('generates sequential order numbers per tenant', async () => {
      const prisma = basePrisma();
      prisma.productionOrder.count.mockResolvedValue(41);
      prisma.productionOrder.create.mockResolvedValue(
        orderRow({ orderNumber: 'MO-000042' }),
      );
      const { svc } = service(prisma);

      await svc.create(actor, createDto());

      expect(prisma.productionOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ orderNumber: 'MO-000042' }),
        }),
      );
      expect(prisma.productionOrder.count).toHaveBeenCalledWith({
        where: { tenantId: actor.tenantId },
      });
    });

    it('retries order number allocation once on a unique-constraint race, then succeeds', async () => {
      const prisma = basePrisma();
      prisma.productionOrder.count.mockResolvedValue(0);
      prisma.productionOrder.create
        .mockRejectedValueOnce(Object.assign(new Error('conflict'), { code: 'P2002' }))
        .mockResolvedValueOnce(orderRow());
      const { svc } = service(prisma);

      await expect(svc.create(actor, createDto())).resolves.toBeDefined();
      expect(prisma.productionOrder.create).toHaveBeenCalledTimes(2);
    });

    it('rejects when the product is not active', async () => {
      const inventoryProducts = defaultInventoryProducts({
        getProductDetail: jest
          .fn()
          .mockResolvedValue(productDetail({ isActive: false })),
      });
      const { svc } = service(basePrisma(), inventoryProducts);

      await expect(svc.create(actor, createDto())).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('propagates a 404 when the product does not exist for this tenant (product tenant isolation)', async () => {
      const inventoryProducts = defaultInventoryProducts({
        getProductDetail: jest
          .fn()
          .mockRejectedValue(new NotFoundException('Product not found')),
      });
      const { svc } = service(basePrisma(), inventoryProducts);

      await expect(svc.create(actor, createDto())).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects when the BOM does not exist', async () => {
      const prisma = basePrisma();
      prisma.bom.findFirst.mockResolvedValue(null);
      const { svc } = service(prisma);

      await expect(svc.create(actor, createDto())).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects when the BOM belongs to a different product', async () => {
      const prisma = basePrisma();
      prisma.bom.findFirst.mockResolvedValue(
        bomRow({ parentProductId: 'other-product-id' }),
      );
      const { svc } = service(prisma);

      await expect(svc.create(actor, createDto())).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it("never resolves a BOM scoped to a different tenant (BOM tenant isolation, enforced via the tenant-scoped findFirst query)", async () => {
      const prisma = basePrisma();
      prisma.bom.findFirst.mockImplementation(
        ({ where }: { where: { tenantId: string } }) =>
          where.tenantId === otherTenant ? bomRow() : null,
      );
      const { svc } = service(prisma);

      await expect(svc.create(actor, createDto())).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.bom.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: actor.tenantId }),
        }),
      );
    });

    it('rejects a DRAFT BOM (only ACTIVE BOMs may be used)', async () => {
      const prisma = basePrisma();
      prisma.bom.findFirst.mockResolvedValue(bomRow({ status: 'DRAFT' }));
      const { svc } = service(prisma);

      await expect(svc.create(actor, createDto())).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects an INACTIVE BOM', async () => {
      const prisma = basePrisma();
      prisma.bom.findFirst.mockResolvedValue(bomRow({ status: 'INACTIVE' }));
      const { svc } = service(prisma);

      await expect(svc.create(actor, createDto())).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects a plannedQuantity of 0', async () => {
      const { svc } = service();

      await expect(
        svc.create(actor, createDto({ plannedQuantity: '0' })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a negative plannedQuantity', async () => {
      const { svc } = service();

      await expect(
        svc.create(actor, createDto({ plannedQuantity: '-5' })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a non-numeric plannedQuantity', async () => {
      const { svc } = service();

      await expect(
        svc.create(actor, createDto({ plannedQuantity: 'NaN' })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an outputUnitOfMeasureId that is neither the product base unit nor an active alternative', async () => {
      const { svc } = service();
      const unknownUnitId = 'u9999999-aaaa-4aaa-8aaa-u99999999999';

      await expect(
        svc.create(actor, createDto({ outputUnitOfMeasureId: unknownUnitId })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts an active alternative UOM and snapshots its code/name', async () => {
      const prisma = basePrisma();
      prisma.productionOrder.create.mockResolvedValue(
        orderRow({ outputUnitOfMeasureId: altUnitId, outputUomCode: 'G', outputUomName: 'Gram' }),
      );
      const { svc } = service(prisma);

      await svc.create(actor, createDto({ outputUnitOfMeasureId: altUnitId }));

      expect(prisma.productionOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            outputUnitOfMeasureId: altUnitId,
            outputUomCode: 'G',
            outputUomName: 'Gram',
          }),
        }),
      );
    });

    it('rejects an inactive warehouse', async () => {
      const inventoryWarehouses = defaultInventoryWarehouses({
        getWarehouseDetail: jest
          .fn()
          .mockResolvedValue({ id: warehouseId, code: 'X', name: 'X', isActive: false }),
      });
      const { svc } = service(basePrisma(), defaultInventoryProducts(), inventoryWarehouses);

      await expect(
        svc.create(actor, createDto({ warehouseId })),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a plannedEndDate before plannedStartDate', async () => {
      const { svc } = service();

      await expect(
        svc.create(
          actor,
          createDto({
            plannedStartDate: '2026-10-05',
            plannedEndDate: '2026-10-01',
          }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('list', () => {
    it('filters by tenant and paginates with defaults', async () => {
      const prisma = basePrisma();
      prisma.productionOrder.count.mockResolvedValue(1);
      prisma.productionOrder.findMany.mockResolvedValue([orderRow()]);
      const { svc } = service(prisma);

      const result = await svc.list(actor);

      expect(result.items).toHaveLength(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.total).toBe(1);
      expect(prisma.productionOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: actor.tenantId },
          skip: 0,
          take: 20,
        }),
      );
    });

    it('searches by order number, product SKU, or product name', async () => {
      const prisma = basePrisma();
      const { svc } = service(prisma);

      await svc.list(actor, { search: 'yarn' });

      expect(prisma.productionOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { orderNumber: { contains: 'yarn', mode: 'insensitive' } },
              { productSku: { contains: 'yarn', mode: 'insensitive' } },
              { productName: { contains: 'yarn', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });

    it('filters by status', async () => {
      const prisma = basePrisma();
      const { svc } = service(prisma);

      await svc.list(actor, { status: 'RELEASED' });

      expect(prisma.productionOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'RELEASED' }),
        }),
      );
    });

    it('caps pageSize at 100', async () => {
      const prisma = basePrisma();
      const { svc } = service(prisma);

      const result = await svc.list(actor, { pageSize: 500 });

      expect(result.pageSize).toBe(100);
    });
  });

  describe('getById', () => {
    it('404s when the order does not belong to the caller tenant (tenant isolation)', async () => {
      const prisma = basePrisma();
      prisma.productionOrder.findFirst.mockResolvedValue(null);
      const { svc } = service(prisma);

      await expect(svc.getById(actor, orderId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.productionOrder.findFirst).toHaveBeenCalledWith({
        where: { id: orderId, tenantId: actor.tenantId },
      });
    });
  });

  describe('update', () => {
    it('updates safe fields on a DRAFT order', async () => {
      const prisma = basePrisma();
      prisma.productionOrder.findFirst.mockResolvedValue(orderRow());
      prisma.productionOrder.update.mockResolvedValue(
        orderRow({ notes: 'Rush order' }),
      );
      const { svc } = service(prisma);

      const result = await svc.update(actor, orderId, { notes: 'Rush order' });

      expect(result.notes).toBe('Rush order');
    });

    it('rejects changing plannedQuantity once PLANNED', async () => {
      const prisma = basePrisma();
      prisma.productionOrder.findFirst.mockResolvedValue(
        orderRow({ status: 'PLANNED' }),
      );
      const { svc } = service(prisma);

      await expect(
        svc.update(actor, orderId, { plannedQuantity: '2000' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('allows changing warehouse/priority/dates/notes once RELEASED', async () => {
      const prisma = basePrisma();
      prisma.productionOrder.findFirst.mockResolvedValue(
        orderRow({ status: 'RELEASED' }),
      );
      prisma.productionOrder.update.mockResolvedValue(
        orderRow({ status: 'RELEASED', priority: 'HIGH' }),
      );
      const { svc } = service(prisma);

      const result = await svc.update(actor, orderId, { priority: 'HIGH' });

      expect(result.priority).toBe('HIGH');
    });

    it('rejects editing a COMPLETED order', async () => {
      const prisma = basePrisma();
      prisma.productionOrder.findFirst.mockResolvedValue(
        orderRow({ status: 'COMPLETED' }),
      );
      const { svc } = service(prisma);

      await expect(
        svc.update(actor, orderId, { notes: 'x' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('404s when updating an order outside the caller tenant', async () => {
      const prisma = basePrisma();
      prisma.productionOrder.findFirst.mockResolvedValue(null);
      const { svc } = service(prisma);

      await expect(
        svc.update(actor, orderId, { notes: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes a DRAFT production order', async () => {
      const prisma = basePrisma();
      prisma.productionOrder.findFirst.mockResolvedValue(orderRow());
      prisma.productionOrder.delete.mockResolvedValue(orderRow());
      const { svc } = service(prisma);

      const result = await svc.remove(actor, orderId);

      expect(result).toEqual({ id: orderId, removed: true });
    });

    it('rejects deleting a non-DRAFT production order', async () => {
      const prisma = basePrisma();
      prisma.productionOrder.findFirst.mockResolvedValue(
        orderRow({ status: 'PLANNED' }),
      );
      const { svc } = service(prisma);

      await expect(svc.remove(actor, orderId)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('lifecycle transitions', () => {
    it('plans a DRAFT order (DRAFT -> PLANNED), re-validating product and BOM', async () => {
      const prisma = basePrisma();
      prisma.productionOrder.findFirst.mockResolvedValue(orderRow());
      const { svc, inventoryProducts } = service(prisma);

      const result = await svc.plan(actor, orderId);

      expect(inventoryProducts.getProductDetail).toHaveBeenCalled();
      expect(prisma.productionOrder.updateMany).toHaveBeenCalledWith({
        where: { id: orderId, tenantId: actor.tenantId, status: { in: ['DRAFT'] } },
        data: { status: 'PLANNED' },
      });
      expect(result.status).toBe('DRAFT');
      // (status reflects the mock findFirst return; the important assertion
      // is the updateMany call shape above, since requireOrder is re-mocked
      // to the same fixture for simplicity in this test)
    });

    it('rejects planning a non-DRAFT order', async () => {
      const prisma = basePrisma();
      prisma.productionOrder.findFirst.mockResolvedValue(
        orderRow({ status: 'PLANNED' }),
      );
      const { svc } = service(prisma);

      await expect(svc.plan(actor, orderId)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('releases a PLANNED order (PLANNED -> RELEASED)', async () => {
      const prisma = basePrisma();
      prisma.productionOrder.findFirst.mockResolvedValue(
        orderRow({ status: 'PLANNED' }),
      );
      const { svc } = service(prisma);

      await svc.release(actor, orderId);

      expect(prisma.productionOrder.updateMany).toHaveBeenCalledWith({
        where: { id: orderId, tenantId: actor.tenantId, status: { in: ['PLANNED'] } },
        data: { status: 'RELEASED' },
      });
    });

    it('rejects releasing a DRAFT order (invalid transition)', async () => {
      const prisma = basePrisma();
      prisma.productionOrder.findFirst.mockResolvedValue(orderRow());
      const { svc } = service(prisma);

      await expect(svc.release(actor, orderId)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('starts a RELEASED order (RELEASED -> IN_PROGRESS)', async () => {
      const prisma = basePrisma();
      prisma.productionOrder.findFirst
        .mockResolvedValueOnce(orderRow({ status: 'RELEASED' })) // pre-check
        .mockResolvedValueOnce(orderRow({ status: 'IN_PROGRESS' })); // post-transition re-fetch
      const { svc } = service(prisma);

      await svc.start(actor, orderId);

      expect(prisma.productionOrder.updateMany).toHaveBeenCalledWith({
        where: { id: orderId, tenantId: actor.tenantId, status: { in: ['RELEASED'] } },
        data: { status: 'IN_PROGRESS' },
      });
    });

    it('rejects starting when the order is not RELEASED (updateMany matches 0 rows)', async () => {
      const prisma = basePrisma();
      prisma.productionOrder.updateMany.mockResolvedValue({ count: 0 });
      prisma.productionOrder.findFirst.mockResolvedValue(orderRow());
      const { svc } = service(prisma);

      await expect(svc.start(actor, orderId)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('cancels a DRAFT, PLANNED, or RELEASED order', async () => {
      const prisma = basePrisma();
      prisma.productionOrder.findFirst.mockResolvedValue(orderRow());
      const { svc } = service(prisma);

      await svc.cancel(actor, orderId);

      expect(prisma.productionOrder.updateMany).toHaveBeenCalledWith({
        where: {
          id: orderId,
          tenantId: actor.tenantId,
          status: { in: ['DRAFT', 'PLANNED', 'RELEASED'] },
        },
        data: { status: 'CANCELLED' },
      });
    });

    it('rejects cancelling an IN_PROGRESS order', async () => {
      const prisma = basePrisma();
      prisma.productionOrder.findFirst.mockResolvedValue(
        orderRow({ status: 'IN_PROGRESS' }),
      );
      const { svc } = service(prisma);

      await expect(svc.cancel(actor, orderId)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('closes a CANCELLED order (CANCELLED -> CLOSED)', async () => {
      const prisma = basePrisma();
      prisma.productionOrder.findFirst
        .mockResolvedValueOnce(orderRow({ status: 'CANCELLED' })) // pre-check
        .mockResolvedValueOnce(orderRow({ status: 'CLOSED' })); // post-transition re-fetch
      const { svc } = service(prisma);

      await svc.close(actor, orderId);

      expect(prisma.productionOrder.updateMany).toHaveBeenCalledWith({
        where: {
          id: orderId,
          tenantId: actor.tenantId,
          status: { in: ['COMPLETED', 'CANCELLED'] },
        },
        data: { status: 'CLOSED' },
      });
    });

    it('rejects closing a DRAFT order', async () => {
      const prisma = basePrisma();
      prisma.productionOrder.findFirst.mockResolvedValue(orderRow());
      const { svc } = service(prisma);

      await expect(svc.close(actor, orderId)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('refuses to complete: completion requires Production Receipt, which is not implemented', async () => {
      const prisma = basePrisma();
      prisma.productionOrder.findFirst.mockResolvedValue(
        orderRow({ status: 'IN_PROGRESS' }),
      );
      const { svc } = service(prisma);

      await expect(svc.complete(actor, orderId)).rejects.toBeInstanceOf(
        NotImplementedException,
      );
    });

    it('rejects completing an order that is not IN_PROGRESS before reaching the not-implemented check', async () => {
      const prisma = basePrisma();
      prisma.productionOrder.findFirst.mockResolvedValue(orderRow());
      const { svc } = service(prisma);

      await expect(svc.complete(actor, orderId)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('protects concurrent lifecycle transitions: a losing concurrent request gets a conflict, not a silent overwrite', async () => {
      const prisma = basePrisma();
      prisma.productionOrder.findFirst.mockResolvedValue(orderRow());
      // Simulate: another request already transitioned this order away from
      // DRAFT between our read and our write, so the conditional updateMany
      // matches zero rows.
      prisma.productionOrder.updateMany.mockResolvedValue({ count: 0 });
      const { svc } = service(prisma);

      await expect(svc.plan(actor, orderId)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });
});
