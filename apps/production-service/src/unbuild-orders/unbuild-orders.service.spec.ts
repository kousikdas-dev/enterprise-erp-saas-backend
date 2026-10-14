import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma-client';
import { UnbuildOrdersService } from './unbuild-orders.service';

describe('UnbuildOrdersService', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };

  const productId = 'p1111111-aaaa-4aaa-8aaa-p11111111111';
  const bomId = 'bom11111-aaaa-4aaa-8aaa-bom111111111';
  const baseUnitId = 'u3333333-aaaa-4aaa-8aaa-u33333333333';
  const altUnitId = 'u4444444-aaaa-4aaa-8aaa-u44444444444';
  const warehouseId = 'w1111111-aaaa-4aaa-8aaa-w11111111111';
  const orderId = 'ub111111-aaaa-4aaa-8aaa-ub1111111111';
  const componentProductId = 'c2222222-aaaa-4aaa-8aaa-c22222222222';
  const itemId = 'item1111-aaaa-4aaa-8aaa-item11111111';

  function productDetail(overrides: Record<string, unknown> = {}) {
    return {
      id: productId,
      sku: 'TABLE-OAK',
      name: 'Oak Table',
      isActive: true,
      trackInventory: true,
      productType: 'GOODS',
      categoryId: 'cat11111-aaaa-4aaa-8aaa-cat111111111',
      unitOfMeasureId: baseUnitId,
      base: { unitOfMeasureId: baseUnitId, code: 'PCS', name: 'Piece' },
      alternatives: [
        { unitOfMeasureId: altUnitId, code: 'BOX', name: 'Box', conversionFactor: '12.000000', sellingPrice: '0' },
      ],
      ...overrides,
    };
  }

  function componentProductDetail(overrides: Record<string, unknown> = {}) {
    return productDetail({
      id: componentProductId,
      sku: 'LEG-OAK',
      name: 'Oak Leg',
      ...overrides,
    });
  }

  function bomItemRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'bomitem1-aaaa-4aaa-8aaa-bomitem11111',
      tenantId: actor.tenantId,
      bomId,
      componentProductId,
      componentProductSku: 'LEG-OAK',
      componentProductName: 'Oak Leg',
      quantity: new Prisma.Decimal('4.000000'),
      unitOfMeasureId: baseUnitId,
      uomCode: 'PCS',
      uomName: 'Piece',
      scrapPercentage: null,
      sequence: 1,
      ...overrides,
    };
  }

  function bomRow(overrides: Record<string, unknown> = {}) {
    return {
      id: bomId,
      tenantId: actor.tenantId,
      parentProductId: productId,
      bomQuantity: new Prisma.Decimal('1.000000'),
      version: 1,
      status: 'ACTIVE',
      items: [bomItemRow()],
      ...overrides,
    };
  }

  function itemRow(overrides: Record<string, unknown> = {}) {
    return {
      id: itemId,
      tenantId: actor.tenantId,
      unbuildOrderId: orderId,
      componentProductId,
      componentProductSku: 'LEG-OAK',
      componentProductName: 'Oak Leg',
      quantity: new Prisma.Decimal('8.000000'),
      unitOfMeasureId: baseUnitId,
      uomCode: 'PCS',
      uomName: 'Piece',
      sequence: 1,
      stockMovementId: null,
      ...overrides,
    };
  }

  function orderRow(overrides: Record<string, unknown> = {}) {
    return {
      id: orderId,
      tenantId: actor.tenantId,
      orderNumber: 'UB-000001',
      productId,
      productSku: 'TABLE-OAK',
      productName: 'Oak Table',
      bomId,
      bomVersion: 1,
      quantity: new Prisma.Decimal('2.000000'),
      unitOfMeasureId: baseUnitId,
      uomCode: 'PCS',
      uomName: 'Piece',
      warehouseId,
      sourceProductionOrderId: null,
      sourceProductionOrderNumber: null,
      status: 'DRAFT',
      processingStartedAt: null,
      processingToken: null,
      unbuildDate: new Date('2026-10-01'),
      notes: null,
      completedAt: null,
      completedBy: null,
      finishedGoodsMovementId: null,
      createdAt: new Date('2026-10-01'),
      updatedAt: new Date('2026-10-01'),
      items: [itemRow()],
      ...overrides,
    };
  }

  function createDto(overrides: Record<string, unknown> = {}) {
    return {
      productId,
      bomId,
      quantity: '2',
      unitOfMeasureId: baseUnitId,
      warehouseId,
      unbuildDate: '2026-10-01',
      ...overrides,
    };
  }

  function postingResult(overrides: Record<string, unknown> = {}) {
    return {
      created: true,
      referenceId: orderId,
      warehouseId,
      finishedGoodsMovement: {
        id: 'movement-fg',
        productId,
        quantity: '2.000000',
        unitCost: '200.0000',
        totalCost: '400.0000',
      },
      componentMovements: [
        {
          id: 'movement-leg',
          productId: componentProductId,
          quantity: '8.000000',
          unitCost: '50.0000',
          totalCost: '400.0000',
        },
      ],
      ...overrides,
    };
  }

  function basePrisma(overrides: Record<string, unknown> = {}) {
    const prisma = {
      unbuildOrder: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      unbuildOrderItem: {
        deleteMany: jest.fn(),
        update: jest.fn(),
      },
      bom: {
        findFirst: jest.fn().mockResolvedValue(bomRow()),
      },
      productionOrder: {
        findFirst: jest.fn(),
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
      getProductDetail: jest.fn(async (_actor: unknown, id: string) =>
        id === componentProductId ? componentProductDetail() : productDetail({ id }),
      ),
      ...overrides,
    };
  }

  function defaultInventoryWarehouses(overrides: Record<string, unknown> = {}) {
    return {
      getWarehouseDetail: jest
        .fn()
        .mockResolvedValue({ id: warehouseId, code: 'FACTORY', name: 'Factory', isActive: true }),
      ...overrides,
    };
  }

  function defaultInventoryUnbuild(overrides: Record<string, unknown> = {}) {
    return {
      post: jest.fn().mockResolvedValue(postingResult()),
      ...overrides,
    };
  }

  function service(
    prisma = basePrisma(),
    inventoryProducts = defaultInventoryProducts(),
    inventoryWarehouses = defaultInventoryWarehouses(),
    inventoryUnbuild = defaultInventoryUnbuild(),
  ) {
    return {
      svc: new UnbuildOrdersService(
        prisma as never,
        inventoryProducts as never,
        inventoryWarehouses as never,
        inventoryUnbuild as never,
      ),
      prisma,
      inventoryProducts,
      inventoryWarehouses,
      inventoryUnbuild,
    };
  }

  describe('create', () => {
    it('creates a DRAFT order with items scaled from the BOM', async () => {
      const { svc, prisma } = service();
      prisma.unbuildOrder.create.mockResolvedValue(orderRow());

      const result = await svc.create(actor, createDto());

      expect(result.status).toBe('DRAFT');
      expect(prisma.unbuildOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderNumber: 'UB-000001',
            quantity: expect.anything(),
            items: { create: [expect.objectContaining({ componentProductId, quantity: expect.anything() })] },
          }),
        }),
      );
    });

    it('rejects a unit of measure that is not the product base unit', async () => {
      const { svc } = service();
      await expect(svc.create(actor, createDto({ unitOfMeasureId: altUnitId }))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects a BOM that was never activated (still DRAFT)', async () => {
      const { svc, prisma } = service();
      prisma.bom.findFirst.mockResolvedValue(bomRow({ status: 'DRAFT' }));
      await expect(svc.create(actor, createDto())).rejects.toBeInstanceOf(ConflictException);
    });

    it('accepts a BOM that is INACTIVE (previously active, since superseded)', async () => {
      const { svc, prisma } = service();
      prisma.bom.findFirst.mockResolvedValue(bomRow({ status: 'INACTIVE' }));
      prisma.unbuildOrder.create.mockResolvedValue(orderRow());
      await expect(svc.create(actor, createDto())).resolves.toBeDefined();
    });
  });

  describe('complete', () => {
    it('claims PROCESSING, posts to inventory, and confirms DONE with matching movement IDs', async () => {
      const { svc, prisma, inventoryUnbuild } = service();
      prisma.unbuildOrder.updateMany
        .mockResolvedValueOnce({ count: 1 }) // claim
        .mockResolvedValueOnce({ count: 1 }); // confirm (inside $transaction)
      prisma.unbuildOrder.findFirst
        .mockResolvedValueOnce(orderRow({ status: 'PROCESSING' })) // read after claim
        .mockResolvedValueOnce(orderRow({ status: 'DONE', finishedGoodsMovementId: 'movement-fg' })); // final read

      const result = await svc.complete(actor, orderId);

      expect(inventoryUnbuild.post).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          referenceId: orderId,
          warehouseId,
          finishedGood: { productId, quantity: '2.000000' },
          components: [{ productId: componentProductId, quantity: '8.000000' }],
        }),
      );
      expect(prisma.unbuildOrderItem.update).toHaveBeenCalledWith({
        where: { id: itemId },
        data: { stockMovementId: 'movement-leg' },
      });
      expect(result.status).toBe('DONE');
    });

    it('reverts PROCESSING back to DRAFT on a definite rejection from inventory-service (insufficient stock)', async () => {
      const { svc, prisma, inventoryUnbuild } = service(
        undefined,
        undefined,
        undefined,
        defaultInventoryUnbuild({
          post: jest.fn().mockRejectedValue(new ConflictException('Insufficient stock')),
        }),
      );
      prisma.unbuildOrder.updateMany.mockResolvedValueOnce({ count: 1 }); // claim only
      prisma.unbuildOrder.findFirst.mockResolvedValueOnce(orderRow({ status: 'PROCESSING' }));

      await expect(svc.complete(actor, orderId)).rejects.toBeInstanceOf(ConflictException);

      // revertToDraft call
      expect(prisma.unbuildOrder.updateMany).toHaveBeenCalledWith({
        where: { id: orderId, tenantId: actor.tenantId, status: 'PROCESSING', processingToken: expect.any(String) },
        data: { status: 'DRAFT', processingStartedAt: null, processingToken: null },
      });
      expect(inventoryUnbuild.post).toHaveBeenCalled();
    });

    it('leaves the order PROCESSING on an ambiguous inventory-service failure (never assumes a timeout means the request stopped)', async () => {
      const { svc, prisma } = service(
        undefined,
        undefined,
        undefined,
        defaultInventoryUnbuild({
          post: jest.fn().mockRejectedValue(new Error('network timeout')),
        }),
      );
      prisma.unbuildOrder.updateMany.mockResolvedValueOnce({ count: 1 }); // claim only
      prisma.unbuildOrder.findFirst.mockResolvedValueOnce(orderRow({ status: 'PROCESSING' }));

      await expect(svc.complete(actor, orderId)).rejects.toThrow('network timeout');

      // revertToDraft must NOT have been called -- only the claim updateMany ran.
      expect(prisma.unbuildOrder.updateMany).toHaveBeenCalledTimes(1);
    });

    it('rejects immediately when the order is already PROCESSING under a live (non-stale) claim, without calling inventory-service', async () => {
      const { svc, prisma, inventoryUnbuild } = service();
      prisma.unbuildOrder.updateMany.mockResolvedValueOnce({ count: 0 });
      prisma.unbuildOrder.findFirst.mockResolvedValueOnce(orderRow({ status: 'PROCESSING' }));

      await expect(svc.complete(actor, orderId)).rejects.toBeInstanceOf(ConflictException);
      expect(inventoryUnbuild.post).not.toHaveBeenCalled();
    });

    it('rejects repeated completion of an already-DONE order without calling inventory-service', async () => {
      const { svc, prisma, inventoryUnbuild } = service();
      prisma.unbuildOrder.updateMany.mockResolvedValueOnce({ count: 0 });
      prisma.unbuildOrder.findFirst.mockResolvedValueOnce(orderRow({ status: 'DONE' }));

      await expect(svc.complete(actor, orderId)).rejects.toBeInstanceOf(ConflictException);
      expect(inventoryUnbuild.post).not.toHaveBeenCalled();
    });

    it('claims via a query that allows reclaiming a stale PROCESSING row, not just DRAFT', async () => {
      const { svc, prisma } = service();
      prisma.unbuildOrder.updateMany
        .mockResolvedValueOnce({ count: 1 }) // reclaim succeeds
        .mockResolvedValueOnce({ count: 1 }); // confirm
      prisma.unbuildOrder.findFirst
        .mockResolvedValueOnce(orderRow({ status: 'PROCESSING' }))
        .mockResolvedValueOnce(orderRow({ status: 'DONE' }));

      await svc.complete(actor, orderId);

      const claimCall = prisma.unbuildOrder.updateMany.mock.calls[0][0];
      expect(claimCall.where.OR).toEqual([
        { status: 'DRAFT' },
        { status: 'PROCESSING', processingStartedAt: { lt: expect.any(Date) } },
      ]);
      expect(claimCall.data.processingToken).toEqual(expect.any(String));
    });

    it('fencing-token race: zero rows on confirm, but reload shows DONE with matching movement IDs -> succeeds without re-posting', async () => {
      const { svc, prisma, inventoryUnbuild } = service();
      prisma.unbuildOrder.updateMany
        .mockResolvedValueOnce({ count: 1 }) // claim
        .mockResolvedValueOnce({ count: 0 }); // confirm lost the race to a reclaiming attempt
      prisma.unbuildOrder.findFirst
        .mockResolvedValueOnce(orderRow({ status: 'PROCESSING' })) // read after claim
        .mockResolvedValueOnce(
          orderRow({
            status: 'DONE',
            finishedGoodsMovementId: 'movement-fg',
            items: [itemRow({ stockMovementId: 'movement-leg' })],
          }),
        ); // reload-and-verify

      const result = await svc.complete(actor, orderId);
      expect(result.status).toBe('DONE');
      expect(inventoryUnbuild.post).toHaveBeenCalledTimes(1);
    });

    it('fails safely when a zero-row confirm reloads a DONE order with mismatched movement IDs', async () => {
      const { svc, prisma } = service();
      prisma.unbuildOrder.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });
      prisma.unbuildOrder.findFirst
        .mockResolvedValueOnce(orderRow({ status: 'PROCESSING' }))
        .mockResolvedValueOnce(
          orderRow({
            status: 'DONE',
            finishedGoodsMovementId: 'a-completely-different-movement',
            items: [itemRow({ stockMovementId: 'also-different' })],
          }),
        );

      await expect(svc.complete(actor, orderId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('fails safely when a zero-row confirm reloads an order that is not DONE at all', async () => {
      const { svc, prisma } = service();
      prisma.unbuildOrder.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });
      prisma.unbuildOrder.findFirst
        .mockResolvedValueOnce(orderRow({ status: 'PROCESSING' }))
        .mockResolvedValueOnce(orderRow({ status: 'PROCESSING' }));

      await expect(svc.complete(actor, orderId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('reverts to DRAFT and rejects when the finished good UOM is no longer the product base unit', async () => {
      const { svc, prisma, inventoryProducts, inventoryUnbuild } = service(
        undefined,
        defaultInventoryProducts({
          getProductDetail: jest.fn(async (_actor: unknown, id: string) =>
            id === componentProductId
              ? componentProductDetail()
              : productDetail({ base: { unitOfMeasureId: altUnitId, code: 'BOX', name: 'Box' } }),
          ),
        }),
      );
      prisma.unbuildOrder.updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.unbuildOrder.findFirst.mockResolvedValueOnce(orderRow({ status: 'PROCESSING' }));

      await expect(svc.complete(actor, orderId)).rejects.toBeInstanceOf(BadRequestException);
      expect(inventoryUnbuild.post).not.toHaveBeenCalled();
      expect(prisma.unbuildOrder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'DRAFT', processingStartedAt: null, processingToken: null } }),
      );
    });
  });

  describe('update', () => {
    it('updates a DRAFT order via the atomic guard and recomputes items', async () => {
      const { svc, prisma } = service();
      prisma.unbuildOrder.updateMany.mockResolvedValueOnce({ count: 1 }); // guard succeeds
      prisma.unbuildOrder.findFirst
        .mockResolvedValueOnce(orderRow({ status: 'DRAFT' })) // initial read
        .mockResolvedValueOnce(
          orderRow({
            quantity: new Prisma.Decimal('3.000000'),
            items: [itemRow({ quantity: new Prisma.Decimal('12.000000') })],
          }),
        ); // final read

      const result = await svc.update(actor, orderId, { quantity: '3' });

      expect(prisma.unbuildOrder.updateMany).toHaveBeenCalledWith({
        where: { id: orderId, tenantId: actor.tenantId, status: 'DRAFT' },
        data: expect.objectContaining({ quantity: expect.anything() }),
      });
      expect(prisma.unbuildOrderItem.deleteMany).toHaveBeenCalledWith({
        where: { unbuildOrderId: orderId },
      });
      expect(prisma.unbuildOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: orderId },
          data: { items: { create: [expect.objectContaining({ componentProductId })] } },
        }),
      );
      expect(result.quantity).toBe('3.000000');
    });

    it('rejects updating a non-DRAFT order at the initial read, before touching the database further', async () => {
      const { svc, prisma } = service();
      prisma.unbuildOrder.findFirst.mockResolvedValueOnce(orderRow({ status: 'DONE' }));

      await expect(svc.update(actor, orderId, { notes: 'x' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.unbuildOrder.updateMany).not.toHaveBeenCalled();
    });

    it('race: update() commits first, then complete() claims and posts the UPDATED data, never stale data', async () => {
      const { svc, prisma, inventoryUnbuild } = service();

      // --- update() wins the row lock first ---
      prisma.unbuildOrder.updateMany.mockResolvedValueOnce({ count: 1 }); // guard succeeds
      prisma.unbuildOrder.findFirst
        .mockResolvedValueOnce(orderRow({ status: 'DRAFT' })) // update()'s initial read
        .mockResolvedValueOnce(
          orderRow({
            status: 'DRAFT',
            quantity: new Prisma.Decimal('3.000000'),
            items: [itemRow({ quantity: new Prisma.Decimal('12.000000') })],
          }),
        ); // update()'s final read, reflecting the committed change

      const updateResult = await svc.update(actor, orderId, { quantity: '3' });
      expect(updateResult.quantity).toBe('3.000000');
      expect(prisma.unbuildOrderItem.deleteMany).toHaveBeenCalledTimes(1);

      // --- complete() runs afterward, against the now-updated row ---
      prisma.unbuildOrder.updateMany
        .mockResolvedValueOnce({ count: 1 }) // claim succeeds (status was still DRAFT)
        .mockResolvedValueOnce({ count: 1 }); // confirm
      prisma.unbuildOrder.findFirst
        .mockResolvedValueOnce(
          orderRow({
            status: 'PROCESSING',
            quantity: new Prisma.Decimal('3.000000'),
            items: [itemRow({ quantity: new Prisma.Decimal('12.000000') })],
          }),
        ) // complete()'s read after claiming -- must reflect update()'s committed data
        .mockResolvedValueOnce(orderRow({ status: 'DONE' })); // final read

      await svc.complete(actor, orderId);

      expect(inventoryUnbuild.post).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          finishedGood: { productId, quantity: '3.000000' },
          components: [{ productId: componentProductId, quantity: '12.000000' }],
        }),
      );
    });

    it('race: complete() claims first, then update() loses the race atomically and never touches item rows', async () => {
      const { svc, prisma } = service();

      // update()'s initial read still observes DRAFT -- the TOCTOU window,
      // since this read happens before complete()'s claim commits...
      prisma.unbuildOrder.findFirst.mockResolvedValueOnce(orderRow({ status: 'DRAFT' }));
      // ...but by the time update()'s transactional guard actually runs,
      // complete()'s claim has already committed, so the guard's
      // conditional updateMany (status: 'DRAFT') matches zero rows.
      prisma.unbuildOrder.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(svc.update(actor, orderId, { quantity: '5' })).rejects.toBeInstanceOf(
        ConflictException,
      );

      // The lost race must never delete or recreate item rows, and must
      // never write the scalar fields either -- no inventory movement can
      // ever become orphaned from an order record this update silently
      // changed out from under a completion in flight.
      expect(prisma.unbuildOrderItem.deleteMany).not.toHaveBeenCalled();
      expect(prisma.unbuildOrder.update).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('cancels a DRAFT order', async () => {
      const { svc, prisma } = service();
      prisma.unbuildOrder.updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.unbuildOrder.findFirst.mockResolvedValueOnce(orderRow({ status: 'CANCELLED' }));
      const result = await svc.cancel(actor, orderId);
      expect(result.status).toBe('CANCELLED');
    });

    it('rejects cancelling a non-DRAFT order', async () => {
      const { svc, prisma } = service();
      prisma.unbuildOrder.updateMany.mockResolvedValueOnce({ count: 0 });
      prisma.unbuildOrder.findFirst.mockResolvedValueOnce(orderRow({ status: 'DONE' }));
      await expect(svc.cancel(actor, orderId)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('getById', () => {
    it('throws NotFoundException for an unknown id', async () => {
      const { svc, prisma } = service();
      prisma.unbuildOrder.findFirst.mockResolvedValueOnce(null);
      await expect(svc.getById(actor, orderId)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
