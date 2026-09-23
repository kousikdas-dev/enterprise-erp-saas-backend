import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  SalesOrderStatus,
  ShipmentStatus,
} from '../../generated/prisma-client';
import { ShipmentsService } from './shipments.service';

describe('ShipmentsService', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const actor = {
    userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    tenantId,
  };
  const warehouseId = 'wwwwwwww-wwww-4www-8www-wwwwwwwwwwww';
  const soItemId = 'iiiiiiii-iiii-4iii-8iii-iiiiiiiiiiii';
  const productId = 'pppppppp-pppp-4ppp-8ppp-pppppppppppp';
  const boxUomId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const pcsUomId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  function decimal(v: string) {
    return new Prisma.Decimal(v);
  }

  function openOrder(overrides?: {
    status?: SalesOrderStatus;
    quantity?: string;
    shippedQuantity?: string;
    unitOfMeasureId?: string | null;
    uomCode?: string | null;
    uomName?: string | null;
    conversionFactor?: string | null;
  }) {
    return {
      id: 'so1',
      tenantId,
      status: overrides?.status ?? SalesOrderStatus.CONFIRMED,
      items: [
        {
          id: soItemId,
          tenantId,
          productId,
          productSku: 'SKU',
          productName: 'Widget',
          quantity: decimal(overrides?.quantity ?? '100'),
          shippedQuantity: decimal(overrides?.shippedQuantity ?? '0'),
          unitOfMeasureId: overrides?.unitOfMeasureId ?? null,
          uomCode: overrides?.uomCode ?? null,
          uomName: overrides?.uomName ?? null,
          conversionFactor: overrides?.conversionFactor
            ? decimal(overrides.conversionFactor)
            : null,
        },
      ],
    };
  }

  function createTx(order = openOrder()) {
    return {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ id: order.id, status: order.status }])
        .mockResolvedValueOnce([{ id: soItemId }]),
      salesOrder: { findFirst: jest.fn().mockResolvedValue(order) },
      shipmentItem: { findMany: jest.fn().mockResolvedValue([]) },
      shipment: { create: jest.fn().mockResolvedValue({ id: 'sh1' }) },
    };
  }

  /** Default per-line issue movement for tests that don't care about cost. */
  function issueMovement(overrides?: Record<string, unknown>) {
    return {
      productId,
      quantity: '1.000000',
      unitCost: '0.0000',
      totalCost: '0.0000',
      ...overrides,
    };
  }

  function defaultAccountingJournal(overrides?: {
    post?: jest.Mock;
    reverse?: jest.Mock;
  }) {
    return {
      post: overrides?.post ?? jest.fn(),
      reverse: overrides?.reverse ?? jest.fn(),
    };
  }

  function buildService(overrides?: {
    prisma?: object;
    inventory?: object;
    inventoryProducts?: object;
    audit?: object;
    accountingJournal?: object;
  }) {
    return new ShipmentsService(
      (overrides?.prisma ?? {}) as never,
      (overrides?.inventory ?? { applyIssue: jest.fn() }) as never,
      (overrides?.inventoryProducts ?? { getUomOptions: jest.fn() }) as never,
      (overrides?.audit ?? { record: jest.fn() }) as never,
      (overrides?.accountingJournal ?? defaultAccountingJournal()) as never,
    );
  }

  describe('create() / post() — baseQuantity computation and Inventory posting', () => {
    it('creates PENDING_STOCK then posts after Inventory success (base UOM, conversionFactor = 1)', async () => {
      const tx = createTx();
      const posted = {
        id: 'sh1',
        tenantId,
        salesOrderId: 'so1',
        warehouseId,
        status: ShipmentStatus.POSTED,
        shippedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [
          {
            id: 'shi1',
            tenantId,
            shipmentId: 'sh1',
            salesOrderItemId: soItemId,
            productId,
            productSku: 'SKU',
            productName: 'Widget',
            quantity: decimal('40'),
            unitOfMeasureId: null,
            uomCode: null,
            uomName: null,
            conversionFactor: decimal('1'),
            baseQuantity: decimal('40'),
            conversionResolvedBy: null,
            conversionResolvedAt: null,
            conversionResolutionNote: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };
      const finalizeTx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([
            { id: 'sh1', status: ShipmentStatus.PENDING_STOCK, salesOrderId: 'so1' },
          ])
          .mockResolvedValueOnce([{ id: 'so1' }])
          .mockResolvedValueOnce([{ id: soItemId }]),
        shipment: {
          findFirstOrThrow: jest.fn().mockResolvedValue({
            id: 'sh1',
            tenantId,
            salesOrderId: 'so1',
            warehouseId,
            status: ShipmentStatus.PENDING_STOCK,
            items: [
              {
                id: 'shi1',
                salesOrderItemId: soItemId,
                productId,
                quantity: decimal('40'),
              },
            ],
            salesOrder: {
              id: 'so1',
              items: [
                { id: soItemId, quantity: decimal('100'), shippedQuantity: decimal('0') },
              ],
            },
          }),
          update: jest.fn().mockResolvedValue(posted),
        },
        shipmentItem: { update: jest.fn().mockResolvedValue({}) },
        salesOrderItem: {
          update: jest.fn(),
          findMany: jest.fn().mockResolvedValue([
            { id: soItemId, quantity: decimal('100'), shippedQuantity: decimal('40') },
          ]),
        },
        salesOrder: { update: jest.fn() },
      };
      let txCall = 0;
      const prisma = {
        $transaction: jest.fn(async (fn: (c: unknown) => Promise<unknown>) => {
          txCall += 1;
          return fn(txCall === 1 ? tx : finalizeTx);
        }),
      };
      const inventory = {
        applyIssue: jest.fn().mockResolvedValue({
          created: true,
          movements: [issueMovement({ productId, quantity: '40.000000' })],
        }),
      };
      const audit = { record: jest.fn().mockResolvedValue(undefined) };
      const service = buildService({ prisma, inventory, audit });

      const result = await service.create(actor, {
        salesOrderId: 'so1',
        warehouseId,
        items: [{ salesOrderItemId: soItemId, quantity: '40' }],
      });

      expect(tx.shipment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ShipmentStatus.PENDING_STOCK }),
        }),
      );
      const createdItem = tx.shipment.create.mock.calls[0][0].data.items.create[0];
      expect(createdItem.conversionFactor.toString()).toBe('1');
      expect(createdItem.baseQuantity.toString()).toBe('40');
      expect(inventory.applyIssue).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          referenceType: 'shipment',
          warehouseId,
          lines: [{ productId, quantity: '40.000000' }],
        }),
      );
      expect(result.status).toBe(ShipmentStatus.POSTED);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'shipment.created' }),
      );
      expect(finalizeTx.salesOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: SalesOrderStatus.PARTIALLY_FULFILLED } }),
      );
    });

    it('computes baseQuantity = quantity × conversionFactor for an alternate UOM (2 BOX × 24 PCS/BOX = 48)', async () => {
      const order = openOrder({
        unitOfMeasureId: boxUomId,
        uomCode: 'BOX',
        uomName: 'Box',
        conversionFactor: '24',
      });
      const tx = createTx(order);
      const prisma = {
        $transaction: jest.fn(async (fn: (c: typeof tx) => Promise<unknown>) => fn(tx)),
      };
      const inventory = { applyIssue: jest.fn().mockRejectedValue(new Error('stop-after-prepare')) };
      const service = buildService({ prisma, inventory });

      await expect(
        service.create(actor, {
          salesOrderId: 'so1',
          warehouseId,
          items: [{ salesOrderItemId: soItemId, quantity: '2' }],
        }),
      ).rejects.toThrow('stop-after-prepare');

      expect(inventory.applyIssue).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({ lines: [{ productId, quantity: '48.000000' }] }),
      );
      const createData = tx.shipment.create.mock.calls[0][0].data;
      expect(createData.items.create[0].baseQuantity.toString()).toBe('48');
      expect(createData.items.create[0].conversionFactor.toString()).toBe('24');
      expect(createData.items.create[0].unitOfMeasureId).toBe(boxUomId);
    });

    it('rejects shipment when quantity exceeds remaining', async () => {
      const order = openOrder({ shippedQuantity: '40' });
      const tx = createTx(order);
      const prisma = {
        $transaction: jest.fn(async (fn: (c: typeof tx) => Promise<unknown>) => fn(tx)),
      };
      const inventory = { applyIssue: jest.fn() };
      const service = buildService({ prisma, inventory });

      await expect(
        service.create(actor, {
          salesOrderId: 'so1',
          warehouseId,
          items: [{ salesOrderItemId: soItemId, quantity: '70' }],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(inventory.applyIssue).not.toHaveBeenCalled();
    });

    it('counts PENDING_STOCK against remaining quantity', async () => {
      const order = openOrder();
      const tx = createTx(order);
      tx.shipmentItem.findMany.mockResolvedValue([
        { salesOrderItemId: soItemId, quantity: decimal('60') },
      ]);
      const prisma = {
        $transaction: jest.fn(async (fn: (c: typeof tx) => Promise<unknown>) => fn(tx)),
      };
      const inventory = { applyIssue: jest.fn() };
      const service = buildService({ prisma, inventory });

      await expect(
        service.create(actor, {
          salesOrderId: 'so1',
          warehouseId,
          items: [{ salesOrderItemId: soItemId, quantity: '50' }],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('keeps PENDING_STOCK when Inventory fails', async () => {
      const tx = createTx();
      const prisma = {
        $transaction: jest.fn(async (fn: (c: typeof tx) => Promise<unknown>) => fn(tx)),
      };
      const inventory = { applyIssue: jest.fn().mockRejectedValue(new Error('down')) };
      const audit = { record: jest.fn().mockResolvedValue(undefined) };
      const service = buildService({ prisma, inventory, audit });

      await expect(
        service.create(actor, {
          salesOrderId: 'so1',
          warehouseId,
          items: [{ salesOrderItemId: soItemId, quantity: '40' }],
        }),
      ).rejects.toThrow('down');
      expect(tx.shipment.create).toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'shipment.created',
          metadata: expect.objectContaining({ status: ShipmentStatus.PENDING_STOCK }),
        }),
      );
      expect(audit.record).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'shipment.posted' }),
      );
    });

    it('multiple shipment lines: each resolves its own baseQuantity independently', async () => {
      const order = {
        id: 'so1',
        tenantId,
        status: SalesOrderStatus.CONFIRMED,
        items: [
          {
            id: soItemId,
            tenantId,
            productId,
            productSku: 'SKU-A',
            productName: 'Widget A',
            quantity: decimal('100'),
            shippedQuantity: decimal('0'),
            unitOfMeasureId: null,
            uomCode: null,
            uomName: null,
            conversionFactor: null,
          },
          {
            id: 'item-2',
            tenantId,
            productId: 'product-2',
            productSku: 'SKU-B',
            productName: 'Widget B',
            quantity: decimal('50'),
            shippedQuantity: decimal('0'),
            unitOfMeasureId: boxUomId,
            uomCode: 'BOX',
            uomName: 'Box',
            conversionFactor: decimal('12'),
          },
        ],
      };
      const tx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([{ id: order.id, status: order.status }])
          .mockResolvedValueOnce([{ id: soItemId }]),
        salesOrder: { findFirst: jest.fn().mockResolvedValue(order) },
        shipmentItem: { findMany: jest.fn().mockResolvedValue([]) },
        shipment: { create: jest.fn().mockResolvedValue({ id: 'sh1' }) },
      };
      const prisma = {
        $transaction: jest.fn(async (fn: (c: typeof tx) => Promise<unknown>) => fn(tx)),
      };
      const inventory = { applyIssue: jest.fn().mockRejectedValue(new Error('stop')) };
      const service = buildService({ prisma, inventory });

      await expect(
        service.create(actor, {
          salesOrderId: 'so1',
          warehouseId,
          items: [
            { salesOrderItemId: soItemId, quantity: '10' },
            { salesOrderItemId: 'item-2', quantity: '3' },
          ],
        }),
      ).rejects.toThrow('stop');

      expect(inventory.applyIssue).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          lines: [
            { productId, quantity: '10.000000' },
            { productId: 'product-2', quantity: '36.000000' },
          ],
        }),
      );
    });
  });

  describe('post() retry — persisted baseQuantity reuse and legacy resolution', () => {
    it('retries post after Inventory outage using stable shipment id (already-resolved baseQuantity reused, not recomputed)', async () => {
      const pending = {
        id: 'sh1',
        tenantId,
        salesOrderId: 'so1',
        warehouseId,
        status: ShipmentStatus.PENDING_STOCK,
        shippedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [
          {
            id: 'shi1',
            tenantId,
            shipmentId: 'sh1',
            salesOrderItemId: soItemId,
            productId,
            productSku: 'SKU',
            productName: 'Widget',
            quantity: decimal('3'),
            unitOfMeasureId: boxUomId,
            uomCode: 'BOX',
            uomName: 'Box',
            conversionFactor: decimal('24'),
            baseQuantity: decimal('72'),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        salesOrder: {
          items: [
            {
              id: soItemId,
              quantity: decimal('100'),
              shippedQuantity: decimal('40'),
              // Deliberately different from the persisted line's factor —
              // proves post() reuses the persisted baseQuantity rather than
              // recomputing from the SalesOrderItem's current value.
              unitOfMeasureId: boxUomId,
              conversionFactor: decimal('999'),
            },
          ],
        },
      };
      const posted = { ...pending, status: ShipmentStatus.POSTED, shippedAt: new Date() };
      const finalizeTx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([
            { id: 'sh1', status: ShipmentStatus.PENDING_STOCK, salesOrderId: 'so1' },
          ])
          .mockResolvedValueOnce([{ id: 'so1' }])
          .mockResolvedValueOnce([{ id: soItemId }]),
        shipment: {
          findFirstOrThrow: jest.fn().mockResolvedValue({
            ...pending,
            salesOrder: { id: 'so1', items: pending.salesOrder.items },
          }),
          update: jest.fn().mockResolvedValue(posted),
        },
        shipmentItem: { update: jest.fn().mockResolvedValue({}) },
        salesOrderItem: {
          update: jest.fn(),
          findMany: jest.fn().mockResolvedValue([
            { id: soItemId, quantity: decimal('100'), shippedQuantity: decimal('100') },
          ]),
        },
        salesOrder: { update: jest.fn() },
      };
      const prisma = {
        shipment: { findFirst: jest.fn().mockResolvedValue(pending) },
        $transaction: jest.fn(async (fn: (c: typeof finalizeTx) => Promise<unknown>) =>
          fn(finalizeTx),
        ),
      };
      const inventory = {
        applyIssue: jest.fn().mockResolvedValue({
          created: true,
          movements: [issueMovement({ productId, quantity: '72.000000' })],
        }),
      };
      const audit = { record: jest.fn().mockResolvedValue(undefined) };
      const service = buildService({ prisma, inventory, audit });

      const result = await service.post(actor, 'sh1');

      expect(inventory.applyIssue).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          referenceId: 'sh1',
          // 72, not 3 × 999 = 2997 — the persisted value was used, never recomputed.
          lines: [{ productId, quantity: '72.000000' }],
        }),
      );
      expect(finalizeTx.salesOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: SalesOrderStatus.FULFILLED } }),
      );
      expect(result.status).toBe(ShipmentStatus.POSTED);
    });

    it('legacy line with no historical UOM (implicit base UOM) resolves and persists baseQuantity = quantity before posting', async () => {
      const pending = {
        id: 'sh1',
        tenantId,
        salesOrderId: 'so1',
        warehouseId,
        status: ShipmentStatus.PENDING_STOCK,
        items: [
          {
            id: 'shi1',
            productId,
            quantity: decimal('60'),
            baseQuantity: null,
          },
        ],
        salesOrder: {
          items: [
            {
              id: soItemId,
              unitOfMeasureId: null,
              uomCode: null,
              uomName: null,
              conversionFactor: null,
            },
          ],
        },
      };
      Object.assign(pending.items[0], { salesOrderItemId: soItemId });
      const persistTx = { shipmentItem: { update: jest.fn() } };
      const finalizeTx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([
            { id: 'sh1', status: ShipmentStatus.PENDING_STOCK, salesOrderId: 'so1' },
          ])
          .mockResolvedValueOnce([{ id: 'so1' }])
          .mockResolvedValueOnce([{ id: soItemId }]),
        shipment: {
          findFirstOrThrow: jest.fn().mockResolvedValue({
            id: 'sh1',
            salesOrderId: 'so1',
            warehouseId,
            items: pending.items,
            salesOrder: { id: 'so1', items: [{ id: soItemId, quantity: decimal('100'), shippedQuantity: decimal('0') }] },
          }),
          update: jest.fn().mockResolvedValue({ ...pending, status: ShipmentStatus.POSTED, items: pending.items }),
        },
        shipmentItem: { update: jest.fn().mockResolvedValue({}) },
        salesOrderItem: {
          update: jest.fn(),
          findMany: jest.fn().mockResolvedValue([{ id: soItemId, quantity: decimal('100'), shippedQuantity: decimal('60') }]),
        },
        salesOrder: { update: jest.fn() },
      };
      let call = 0;
      const prisma = {
        shipment: { findFirst: jest.fn().mockResolvedValue(pending) },
        $transaction: jest.fn(async (fn: (c: unknown) => Promise<unknown>) => {
          call += 1;
          return fn(call === 1 ? persistTx : finalizeTx);
        }),
      };
      const inventory = {
        applyIssue: jest.fn().mockResolvedValue({
          created: true,
          movements: [issueMovement({ productId, quantity: '60.000000' })],
        }),
      };
      const service = buildService({ prisma, inventory });

      const result = await service.post(actor, 'sh1');

      expect(persistTx.shipmentItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'shi1' },
          data: expect.objectContaining({ conversionFactor: expect.anything() }),
        }),
      );
      const persistedData = persistTx.shipmentItem.update.mock.calls[0][0].data;
      expect(persistedData.baseQuantity.toString()).toBe('60');
      expect(persistedData.conversionFactor.toString()).toBe('1');
      expect(inventory.applyIssue).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({ lines: [{ productId, quantity: '60.000000' }] }),
      );
      expect(result.status).toBe(ShipmentStatus.POSTED);
    });

    it('legacy line with an unrecoverable historical conversion blocks into UOM_RESOLUTION_REQUIRED without calling Inventory', async () => {
      const pending = {
        id: 'sh1',
        tenantId,
        salesOrderId: 'so1',
        warehouseId,
        status: ShipmentStatus.PENDING_STOCK,
        items: [
          {
            id: 'shi1',
            salesOrderItemId: soItemId,
            productId,
            quantity: decimal('10'),
            baseQuantity: null,
          },
        ],
        salesOrder: {
          items: [
            {
              id: soItemId,
              // uomId present but conversionFactor missing — genuinely
              // inconsistent historical data, not "no UOM used".
              unitOfMeasureId: boxUomId,
              uomCode: 'BOX',
              uomName: 'Box',
              conversionFactor: null,
            },
          ],
        },
      };
      const prisma = {
        shipment: {
          findFirst: jest.fn().mockResolvedValue(pending),
          update: jest.fn().mockResolvedValue({ ...pending, status: ShipmentStatus.UOM_RESOLUTION_REQUIRED }),
        },
      };
      const inventory = { applyIssue: jest.fn() };
      const service = buildService({ prisma, inventory });

      const error: ConflictException = await service
        .post(actor, 'sh1')
        .catch((e: unknown) => e as ConflictException);

      expect(error).toBeInstanceOf(ConflictException);
      const response = error.getResponse() as { code: string; details: unknown };
      expect(response.code).toBe('SHIPMENT_CONVERSION_UNRESOLVED');
      expect(response.details).toEqual([{ shipmentItemId: 'shi1' }]);
      expect(prisma.shipment.update).toHaveBeenCalledWith({
        where: { id: 'sh1' },
        data: { status: ShipmentStatus.UOM_RESOLUTION_REQUIRED },
      });
      expect(inventory.applyIssue).not.toHaveBeenCalled();
    });

    it('posts idempotently when already POSTED', async () => {
      const existing = {
        id: 'sh1',
        tenantId,
        salesOrderId: 'so1',
        warehouseId,
        status: ShipmentStatus.POSTED,
        shippedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [
          {
            id: 'shi1',
            tenantId,
            shipmentId: 'sh1',
            salesOrderItemId: soItemId,
            productId,
            productSku: 'SKU',
            productName: 'Widget',
            quantity: decimal('40'),
            baseQuantity: decimal('40'),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        salesOrder: { items: [] },
      };
      const prisma = { shipment: { findFirst: jest.fn().mockResolvedValue(existing) } };
      const inventory = { applyIssue: jest.fn() };
      const service = buildService({ prisma, inventory });
      const result = await service.post(actor, 'sh1');
      expect(result.status).toBe(ShipmentStatus.POSTED);
      expect(inventory.applyIssue).not.toHaveBeenCalled();
    });

    it('scopes getById to tenant', async () => {
      const prisma = { shipment: { findFirst: jest.fn().mockResolvedValue(null) } };
      const service = buildService({ prisma });
      await expect(service.getById(actor, 'sh1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.shipment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'sh1', tenantId } }),
      );
    });
  });

  describe('resolveConversion() — manual legacy-line resolution', () => {
    function blockedShipment(overrides?: { lineBaseQuantity?: Prisma.Decimal | null }) {
      return {
        id: 'sh1',
        tenantId,
        status: ShipmentStatus.UOM_RESOLUTION_REQUIRED,
        items: [
          {
            id: 'shi1',
            salesOrderItemId: soItemId,
            productId,
            quantity: decimal('10'),
            baseQuantity: overrides?.lineBaseQuantity ?? null,
          },
        ],
        salesOrder: {
          items: [
            {
              id: soItemId,
              unitOfMeasureId: boxUomId,
              uomCode: 'BOX',
              uomName: 'Box',
              conversionFactor: null,
            },
          ],
        },
      };
    }

    const uomOptions = {
      productId,
      base: { unitOfMeasureId: pcsUomId, code: 'PCS', name: 'Piece' },
      alternatives: [
        { unitOfMeasureId: boxUomId, code: 'BOX', name: 'Box', conversionFactor: '24', sellingPrice: '100' },
        {
          unitOfMeasureId: 'zzzzzzzz-zzzz-4zzz-8zzz-zzzzzzzzzzzz',
          code: 'BAD',
          name: 'Bad unit',
          conversionFactor: '0',
          sellingPrice: '0',
        },
      ],
    };

    it('accepts a valid alternate UOM, persists resolution fields, and returns the shipment to PENDING_STOCK', async () => {
      const shipment = blockedShipment();
      const prisma = {
        shipment: {
          findFirst: jest.fn().mockResolvedValue(shipment),
          update: jest
            .fn()
            .mockResolvedValue({ ...shipment, status: ShipmentStatus.PENDING_STOCK }),
        },
        shipmentItem: { update: jest.fn().mockResolvedValue({}) },
      };
      const inventoryProducts = { getUomOptions: jest.fn().mockResolvedValue(uomOptions) };
      const audit = { record: jest.fn() };
      const service = buildService({ prisma, inventoryProducts, audit });

      const result = await service.resolveConversion(actor, 'sh1', 'shi1', {
        unitOfMeasureId: boxUomId,
        note: 'Confirmed with warehouse team',
      });

      expect(prisma.shipmentItem.update).toHaveBeenCalledWith({
        where: { id: 'shi1' },
        data: expect.objectContaining({
          unitOfMeasureId: boxUomId,
          uomCode: 'BOX',
          uomName: 'Box',
          conversionResolvedBy: actor.userId,
          conversionResolutionNote: 'Confirmed with warehouse team',
        }),
      });
      const persisted = prisma.shipmentItem.update.mock.calls[0][0].data;
      expect(persisted.baseQuantity.toString()).toBe('240');
      expect(persisted.conversionFactor.toString()).toBe('24');
      expect(prisma.shipment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: ShipmentStatus.PENDING_STOCK } }),
      );
      expect(result.status).toBe(ShipmentStatus.PENDING_STOCK);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'shipment.conversion_resolved' }),
      );
    });

    it('accepts the product base UOM with conversionFactor = 1', async () => {
      const shipment = blockedShipment();
      const prisma = {
        shipment: {
          findFirst: jest.fn().mockResolvedValue(shipment),
          update: jest.fn().mockResolvedValue({ ...shipment, status: ShipmentStatus.PENDING_STOCK }),
        },
        shipmentItem: { update: jest.fn().mockResolvedValue({}) },
      };
      const inventoryProducts = { getUomOptions: jest.fn().mockResolvedValue(uomOptions) };
      const service = buildService({ prisma, inventoryProducts });

      await service.resolveConversion(actor, 'sh1', 'shi1', { unitOfMeasureId: pcsUomId });

      const persisted = prisma.shipmentItem.update.mock.calls[0][0].data;
      expect(persisted.conversionFactor.toString()).toBe('1');
      expect(persisted.baseQuantity.toString()).toBe('10');
    });

    it('rejects a UOM that does not belong to this line\'s product (covers another product / another tenant / nonexistent — indistinguishable from this product-scoped lookup)', async () => {
      const shipment = blockedShipment();
      const prisma = { shipment: { findFirst: jest.fn().mockResolvedValue(shipment) } };
      const inventoryProducts = { getUomOptions: jest.fn().mockResolvedValue(uomOptions) };
      const service = buildService({ prisma, inventoryProducts });

      const error: ConflictException = await service
        .resolveConversion(actor, 'sh1', 'shi1', {
          unitOfMeasureId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        })
        .catch((e: unknown) => e as ConflictException);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error.getResponse() as { code: string }).code).toBe(
        'SHIPMENT_UOM_INVALID_FOR_PRODUCT',
      );
    });

    it('rejects a UOM with a zero conversion factor', async () => {
      const shipment = blockedShipment();
      const prisma = { shipment: { findFirst: jest.fn().mockResolvedValue(shipment) } };
      const inventoryProducts = { getUomOptions: jest.fn().mockResolvedValue(uomOptions) };
      const service = buildService({ prisma, inventoryProducts });

      const error: ConflictException = await service
        .resolveConversion(actor, 'sh1', 'shi1', {
          unitOfMeasureId: 'zzzzzzzz-zzzz-4zzz-8zzz-zzzzzzzzzzzz',
        })
        .catch((e: unknown) => e as ConflictException);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error.getResponse() as { code: string }).code).toBe(
        'SHIPMENT_UOM_INVALID_CONVERSION_FACTOR',
      );
    });

    it('rejects resolution when the shipment is not awaiting resolution', async () => {
      const prisma = {
        shipment: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'sh1',
            status: ShipmentStatus.PENDING_STOCK,
            items: [],
            salesOrder: { items: [] },
          }),
        },
      };
      const service = buildService({ prisma });

      await expect(
        service.resolveConversion(actor, 'sh1', 'shi1', { unitOfMeasureId: pcsUomId }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects resolution when the line is already resolved', async () => {
      const shipment = blockedShipment({ lineBaseQuantity: decimal('10') });
      const prisma = { shipment: { findFirst: jest.fn().mockResolvedValue(shipment) } };
      const service = buildService({ prisma });

      await expect(
        service.resolveConversion(actor, 'sh1', 'shi1', { unitOfMeasureId: pcsUomId }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('leaves the shipment blocked when other lines still need resolution', async () => {
      const shipment = {
        id: 'sh1',
        tenantId,
        status: ShipmentStatus.UOM_RESOLUTION_REQUIRED,
        items: [
          { id: 'shi1', salesOrderItemId: soItemId, productId, quantity: decimal('10'), baseQuantity: null },
          { id: 'shi2', salesOrderItemId: 'so-item-2', productId: 'product-2', quantity: decimal('5'), baseQuantity: null },
        ],
        salesOrder: {
          items: [
            { id: soItemId, unitOfMeasureId: boxUomId, uomCode: 'BOX', uomName: 'Box', conversionFactor: null },
            { id: 'so-item-2', unitOfMeasureId: boxUomId, uomCode: 'BOX', uomName: 'Box', conversionFactor: null },
          ],
        },
      };
      const prisma = {
        shipment: {
          findFirst: jest.fn().mockResolvedValue(shipment),
          update: jest.fn().mockResolvedValue({ ...shipment }),
        },
        shipmentItem: { update: jest.fn().mockResolvedValue({}) },
      };
      const inventoryProducts = { getUomOptions: jest.fn().mockResolvedValue(uomOptions) };
      const service = buildService({ prisma, inventoryProducts });

      await service.resolveConversion(actor, 'sh1', 'shi1', { unitOfMeasureId: boxUomId });

      expect(prisma.shipment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: {} }),
      );
    });
  });

  describe('Phase 3.3 — COGS accounting', () => {
    const soItemId2 = 'jjjjjjjj-jjjj-4jjj-8jjj-jjjjjjjjjjjj';
    const productId2 = 'qqqqqqqq-qqqq-4qqq-8qqq-qqqqqqqqqqqq';
    const shipmentId = '99999999-9999-4999-8999-999999999999';

    /**
     * Builds a full create()-path harness (prepare tx + finalize tx +
     * Inventory + Accounting mocks) for N lines, each independently
     * configurable for productTracksInventory / issue cost. Mirrors the
     * structure of the existing "creates PENDING_STOCK then posts..." test
     * above, generalized to N lines and parameterized cost/tracking.
     */
    function buildCogsScenario(
      lines: Array<{
        soItemId: string;
        productId: string;
        quantity: string;
        productTracksInventory: boolean | null;
        unitCost: string;
        totalCost: string;
      }>,
      opts?: { accountingJournal?: ReturnType<typeof defaultAccountingJournal> },
    ) {
      const shipmentItemIds = lines.map((_, i) => `shi-${i}`);
      const orderItems = lines.map((l) => ({
        id: l.soItemId,
        tenantId,
        productId: l.productId,
        productSku: 'SKU',
        productName: 'Widget',
        quantity: decimal('1000'),
        shippedQuantity: decimal('0'),
        unitOfMeasureId: null,
        uomCode: null,
        uomName: null,
        conversionFactor: null,
        productTracksInventory: l.productTracksInventory,
      }));

      const tx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'so1', status: SalesOrderStatus.CONFIRMED }])
          .mockResolvedValueOnce([{ id: 'x' }]),
        salesOrder: {
          findFirst: jest.fn().mockResolvedValue({ id: 'so1', tenantId, items: orderItems }),
        },
        shipmentItem: { findMany: jest.fn().mockResolvedValue([]) },
        shipment: { create: jest.fn().mockResolvedValue({ id: shipmentId }) },
      };

      const finalItems = lines.map((l, i) => ({
        id: shipmentItemIds[i],
        salesOrderItemId: l.soItemId,
        productId: l.productId,
        quantity: decimal(l.quantity),
        productTracksInventory: l.productTracksInventory,
        totalCost: decimal(l.totalCost),
      }));

      const finalizeTx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([
            { id: shipmentId, status: ShipmentStatus.PENDING_STOCK, salesOrderId: 'so1' },
          ])
          .mockResolvedValueOnce([{ id: 'so1' }])
          .mockResolvedValueOnce([{ id: 'x' }]),
        shipment: {
          findFirstOrThrow: jest.fn().mockResolvedValue({
            id: shipmentId,
            salesOrderId: 'so1',
            warehouseId,
            items: lines.map((l, i) => ({
              id: shipmentItemIds[i],
              salesOrderItemId: l.soItemId,
              productId: l.productId,
              quantity: decimal(l.quantity),
            })),
            salesOrder: { id: 'so1', items: orderItems },
          }),
          update: jest.fn().mockResolvedValue({
            id: shipmentId,
            tenantId,
            salesOrderId: 'so1',
            warehouseId,
            status: ShipmentStatus.POSTED,
            shippedAt: new Date(),
            accountingPostingStatus: 'NOT_POSTED',
            journalEntryId: null,
            items: finalItems,
          }),
        },
        shipmentItem: { update: jest.fn().mockResolvedValue({}) },
        salesOrderItem: {
          update: jest.fn(),
          findMany: jest.fn().mockResolvedValue(
            orderItems.map((it) => ({
              ...it,
              shippedQuantity: decimal(
                lines.find((l) => l.soItemId === it.id)!.quantity,
              ),
            })),
          ),
        },
        salesOrder: { update: jest.fn() },
      };

      let txCall = 0;
      const prisma = {
        $transaction: jest.fn(async (fn: (c: unknown) => Promise<unknown>) => {
          txCall += 1;
          return fn(txCall === 1 ? tx : finalizeTx);
        }),
        shipment: {
          update: jest.fn().mockResolvedValue({
            id: shipmentId,
            tenantId,
            salesOrderId: 'so1',
            warehouseId,
            status: ShipmentStatus.POSTED,
            shippedAt: new Date(),
            accountingPostingStatus: 'POSTED',
            journalEntryId: 'je-1',
            items: finalItems,
          }),
          findFirst: jest.fn().mockResolvedValue({
            id: shipmentId,
            tenantId,
            salesOrderId: 'so1',
            warehouseId,
            status: ShipmentStatus.POSTED,
            shippedAt: new Date(),
            accountingPostingStatus: 'FAILED',
            journalEntryId: null,
            items: finalItems,
          }),
        },
      };

      const movements = lines.map((l) =>
        issueMovement({
          productId: l.productId,
          quantity: l.quantity,
          unitCost: l.unitCost,
          totalCost: l.totalCost,
        }),
      );
      const inventory = {
        applyIssue: jest.fn().mockResolvedValue({ created: true, movements }),
      };
      const accountingJournal =
        opts?.accountingJournal ??
        defaultAccountingJournal({
          post: jest.fn().mockResolvedValue({
            id: 'je-1',
            idempotentReplay: false,
          }),
        });
      const audit = { record: jest.fn().mockResolvedValue(undefined) };
      const service = buildService({ prisma, inventory, audit, accountingJournal });

      return { service, prisma, finalizeTx, inventory, accountingJournal, shipmentId };
    }

    it('exact single-line shipment posts Dr COGS / Cr INVENTORY_ASSET for the issue totalCost, balanced', async () => {
      const { service, accountingJournal } = buildCogsScenario([
        {
          soItemId,
          productId,
          quantity: '10',
          productTracksInventory: true,
          unitCost: '12.0000',
          totalCost: '120.0000',
        },
      ]);

      const result = await service.create(actor, {
        salesOrderId: 'so1',
        warehouseId,
        items: [{ salesOrderItemId: soItemId, quantity: '10' }],
      });

      expect(accountingJournal.post).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          sourceService: 'sales-service',
          sourceType: 'SHIPMENT',
          sourceId: shipmentId,
          lines: [
            { role: 'COGS', side: 'DEBIT', amount: '120.0000' },
            { role: 'INVENTORY_ASSET', side: 'CREDIT', amount: '120.0000' },
          ],
        }),
      );
      const request = accountingJournal.post.mock.calls[0][1];
      const totalDebit = request.lines
        .filter((l: any) => l.side === 'DEBIT')
        .reduce((sum: number, l: any) => sum + Number(l.amount), 0);
      const totalCredit = request.lines
        .filter((l: any) => l.side === 'CREDIT')
        .reduce((sum: number, l: any) => sum + Number(l.amount), 0);
      expect(totalDebit).toBe(totalCredit);
      expect(result.accountingPostingStatus).toBe('POSTED');
      expect(result.journalEntryId).toBe('je-1');
    });

    it('multi-line shipment sums COGS only over tracked lines; non-tracked lines contribute nothing', async () => {
      const { service, accountingJournal } = buildCogsScenario([
        {
          soItemId,
          productId,
          quantity: '10',
          productTracksInventory: true,
          unitCost: '12.0000',
          totalCost: '120.0000',
        },
        {
          soItemId: soItemId2,
          productId: productId2,
          quantity: '5',
          productTracksInventory: false,
          unitCost: '50.0000',
          totalCost: '250.0000',
        },
      ]);

      await service.create(actor, {
        salesOrderId: 'so1',
        warehouseId,
        items: [
          { salesOrderItemId: soItemId, quantity: '10' },
          { salesOrderItemId: soItemId2, quantity: '5' },
        ],
      });

      expect(accountingJournal.post).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          lines: [
            { role: 'COGS', side: 'DEBIT', amount: '120.0000' },
            { role: 'INVENTORY_ASSET', side: 'CREDIT', amount: '120.0000' },
          ],
        }),
      );
    });

    it('all-non-tracked shipment posts no journal at all; accountingPostingStatus stays NOT_POSTED', async () => {
      const { service, accountingJournal } = buildCogsScenario([
        {
          soItemId,
          productId,
          quantity: '10',
          productTracksInventory: false,
          unitCost: '12.0000',
          totalCost: '120.0000',
        },
      ]);

      const result = await service.create(actor, {
        salesOrderId: 'so1',
        warehouseId,
        items: [{ salesOrderItemId: soItemId, quantity: '10' }],
      });

      expect(accountingJournal.post).not.toHaveBeenCalled();
      expect(result.accountingPostingStatus).toBe('NOT_POSTED');
    });

    it('historical NULL productTracksInventory is treated identically to false', async () => {
      const { service, accountingJournal } = buildCogsScenario([
        {
          soItemId,
          productId,
          quantity: '10',
          productTracksInventory: null,
          unitCost: '12.0000',
          totalCost: '120.0000',
        },
      ]);

      await service.create(actor, {
        salesOrderId: 'so1',
        warehouseId,
        items: [{ salesOrderItemId: soItemId, quantity: '10' }],
      });

      expect(accountingJournal.post).not.toHaveBeenCalled();
    });

    it('partial shipment: COGS reflects only the partially-shipped quantity\'s issue cost', async () => {
      const { service, accountingJournal } = buildCogsScenario([
        {
          soItemId,
          productId,
          quantity: '4',
          productTracksInventory: true,
          unitCost: '12.0000',
          totalCost: '48.0000',
        },
      ]);

      await service.create(actor, {
        salesOrderId: 'so1',
        warehouseId,
        items: [{ salesOrderItemId: soItemId, quantity: '4' }],
      });

      expect(accountingJournal.post).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          lines: [
            { role: 'COGS', side: 'DEBIT', amount: '48.0000' },
            { role: 'INVENTORY_ASSET', side: 'CREDIT', amount: '48.0000' },
          ],
        }),
      );
    });

    it('two shipments against the same sales order at different moving-average costs post two independent journals', async () => {
      const first = buildCogsScenario([
        {
          soItemId,
          productId,
          quantity: '10',
          productTracksInventory: true,
          unitCost: '12.0000',
          totalCost: '120.0000',
        },
      ]);
      await first.service.create(actor, {
        salesOrderId: 'so1',
        warehouseId,
        items: [{ salesOrderItemId: soItemId, quantity: '10' }],
      });

      const second = buildCogsScenario([
        {
          soItemId,
          productId,
          quantity: '10',
          productTracksInventory: true,
          unitCost: '15.0000',
          totalCost: '150.0000',
        },
      ]);
      await second.service.create(actor, {
        salesOrderId: 'so1',
        warehouseId,
        items: [{ salesOrderItemId: soItemId, quantity: '10' }],
      });

      expect(first.accountingJournal.post).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          lines: [
            { role: 'COGS', side: 'DEBIT', amount: '120.0000' },
            { role: 'INVENTORY_ASSET', side: 'CREDIT', amount: '120.0000' },
          ],
        }),
      );
      expect(second.accountingJournal.post).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          lines: [
            { role: 'COGS', side: 'DEBIT', amount: '150.0000' },
            { role: 'INVENTORY_ASSET', side: 'CREDIT', amount: '150.0000' },
          ],
        }),
      );
    });

    it('insufficient stock (Inventory rejects) leaves the shipment PENDING_STOCK and never attempts a COGS posting', async () => {
      const tx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'so1', status: SalesOrderStatus.CONFIRMED }])
          .mockResolvedValueOnce([{ id: 'x' }]),
        salesOrder: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'so1',
            tenantId,
            items: [
              {
                id: soItemId,
                tenantId,
                productId,
                productSku: 'SKU',
                productName: 'Widget',
                quantity: decimal('1000'),
                shippedQuantity: decimal('0'),
                unitOfMeasureId: null,
                uomCode: null,
                uomName: null,
                conversionFactor: null,
                productTracksInventory: true,
              },
            ],
          }),
        },
        shipmentItem: { findMany: jest.fn().mockResolvedValue([]) },
        shipment: { create: jest.fn().mockResolvedValue({ id: shipmentId }) },
      };
      const prisma = {
        $transaction: jest.fn(async (fn: (c: unknown) => Promise<unknown>) => fn(tx)),
        shipment: { update: jest.fn(), findFirst: jest.fn() },
      };
      const inventory = {
        applyIssue: jest.fn().mockRejectedValue(new ConflictException('Insufficient stock')),
      };
      const accountingJournal = defaultAccountingJournal();
      const service = buildService({ prisma, inventory, accountingJournal });

      await expect(
        service.create(actor, {
          salesOrderId: 'so1',
          warehouseId,
          items: [{ salesOrderItemId: soItemId, quantity: '10' }],
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(accountingJournal.post).not.toHaveBeenCalled();
      expect(prisma.shipment.update).not.toHaveBeenCalled();
    });

    it('accounting posting fails post-commit: shipment stays POSTED with accountingPostingStatus FAILED, journalEntryId null', async () => {
      const failingPost = jest.fn().mockRejectedValue(new Error('accounting service unreachable'));
      const { service } = buildCogsScenario(
        [
          {
            soItemId,
            productId,
            quantity: '10',
            productTracksInventory: true,
            unitCost: '12.0000',
            totalCost: '120.0000',
          },
        ],
        { accountingJournal: defaultAccountingJournal({ post: failingPost }) },
      );

      const result = await service.create(actor, {
        salesOrderId: 'so1',
        warehouseId,
        items: [{ salesOrderItemId: soItemId, quantity: '10' }],
      });

      expect(result.status).toBe(ShipmentStatus.POSTED);
      expect(result.accountingPostingStatus).toBe('FAILED');
      expect(result.journalEntryId).toBeNull();
    });

    describe('retryAccountingPosting()', () => {
      function shipmentRow(overrides: Record<string, unknown> = {}) {
        return {
          id: shipmentId,
          tenantId,
          salesOrderId: 'so1',
          warehouseId,
          status: ShipmentStatus.POSTED,
          shippedAt: new Date(),
          accountingPostingStatus: 'NOT_POSTED',
          journalEntryId: null,
          items: [
            {
              id: 'shi-0',
              salesOrderItemId: soItemId,
              productId,
              quantity: decimal('10'),
              productTracksInventory: true,
              totalCost: decimal('120.0000'),
            },
          ],
          ...overrides,
        };
      }

      it('rejects retry for a non-POSTED shipment', async () => {
        const prisma = {
          shipment: {
            findFirst: jest
              .fn()
              .mockResolvedValue(shipmentRow({ status: ShipmentStatus.PENDING_STOCK })),
          },
        };
        const service = buildService({ prisma });

        await expect(
          service.retryAccountingPosting(actor, shipmentId),
        ).rejects.toBeInstanceOf(ConflictException);
      });

      it('no-ops when accountingPostingStatus is already POSTED', async () => {
        const prisma = {
          shipment: {
            findFirst: jest
              .fn()
              .mockResolvedValue(shipmentRow({ accountingPostingStatus: 'POSTED', journalEntryId: 'je-existing' })),
          },
        };
        const accountingJournal = defaultAccountingJournal();
        const service = buildService({ prisma, accountingJournal });

        const result = await service.retryAccountingPosting(actor, shipmentId);

        expect(accountingJournal.post).not.toHaveBeenCalled();
        expect(result.journalEntryId).toBe('je-existing');
      });

      it('retries and surfaces the error when accounting is still unavailable', async () => {
        const failingPost = jest.fn().mockRejectedValue(new Error('still down'));
        const prisma = {
          shipment: {
            findFirst: jest.fn().mockResolvedValue(shipmentRow()),
            update: jest.fn().mockResolvedValue(shipmentRow({ accountingPostingStatus: 'FAILED' })),
          },
        };
        const accountingJournal = defaultAccountingJournal({ post: failingPost });
        const service = buildService({ prisma, accountingJournal });

        await expect(
          service.retryAccountingPosting(actor, shipmentId),
        ).rejects.toThrow('still down');
      });

      it('retries and succeeds, updating accountingPostingStatus to POSTED', async () => {
        const prisma = {
          shipment: {
            findFirst: jest.fn().mockResolvedValue(shipmentRow()),
            update: jest.fn().mockResolvedValue(
              shipmentRow({ accountingPostingStatus: 'POSTED', journalEntryId: 'je-retry' }),
            ),
          },
        };
        const accountingJournal = defaultAccountingJournal({
          post: jest.fn().mockResolvedValue({ id: 'je-retry', idempotentReplay: false }),
        });
        const audit = { record: jest.fn().mockResolvedValue(undefined) };
        const service = buildService({ prisma, accountingJournal, audit });

        const result = await service.retryAccountingPosting(actor, shipmentId);

        expect(accountingJournal.post).toHaveBeenCalledWith(
          actor,
          expect.objectContaining({ sourceType: 'SHIPMENT', sourceId: shipmentId }),
        );
        expect(result.accountingPostingStatus).toBe('POSTED');
        expect(result.journalEntryId).toBe('je-retry');
      });
    });
  });
});
