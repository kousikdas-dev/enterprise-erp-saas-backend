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

  function decimal(v: string) {
    return new Prisma.Decimal(v);
  }

  function openOrder(overrides?: {
    status?: SalesOrderStatus;
    quantity?: string;
    shippedQuantity?: string;
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

  it('creates PENDING_STOCK then posts after Inventory success', async () => {
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
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    };
    const finalizeTx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: 'sh1',
            status: ShipmentStatus.PENDING_STOCK,
            salesOrderId: 'so1',
          },
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
              {
                id: soItemId,
                quantity: decimal('100'),
                shippedQuantity: decimal('0'),
              },
            ],
          },
        }),
        update: jest.fn().mockResolvedValue(posted),
      },
      salesOrderItem: {
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          {
            id: soItemId,
            quantity: decimal('100'),
            shippedQuantity: decimal('40'),
          },
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
      applyIssue: jest.fn().mockResolvedValue({ created: true }),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new ShipmentsService(
      prisma as never,
      inventory as never,
      audit as never,
    );

    const result = await service.create(actor, {
      salesOrderId: 'so1',
      warehouseId,
      items: [{ salesOrderItemId: soItemId, quantity: '40' }],
    });

    expect(tx.shipment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ShipmentStatus.PENDING_STOCK,
        }),
      }),
    );
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
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'shipment.posted' }),
    );
    expect(finalizeTx.salesOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: SalesOrderStatus.PARTIALLY_FULFILLED },
      }),
    );
  });

  it('rejects shipment when quantity exceeds remaining', async () => {
    const order = openOrder({ shippedQuantity: '40' });
    const tx = createTx(order);
    const prisma = {
      $transaction: jest.fn(async (fn: (c: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
    const inventory = { applyIssue: jest.fn() };
    const service = new ShipmentsService(
      prisma as never,
      inventory as never,
      { record: jest.fn() } as never,
    );

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
      {
        salesOrderItemId: soItemId,
        quantity: decimal('60'),
      },
    ]);
    const prisma = {
      $transaction: jest.fn(async (fn: (c: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
    const inventory = { applyIssue: jest.fn() };
    const service = new ShipmentsService(
      prisma as never,
      inventory as never,
      { record: jest.fn() } as never,
    );

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
      $transaction: jest.fn(async (fn: (c: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
    const inventory = {
      applyIssue: jest.fn().mockRejectedValue(new Error('down')),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new ShipmentsService(
      prisma as never,
      inventory as never,
      audit as never,
    );

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
        metadata: expect.objectContaining({
          status: ShipmentStatus.PENDING_STOCK,
        }),
      }),
    );
    expect(audit.record).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'shipment.posted' }),
    );
  });

  it('retries post after Inventory outage using stable shipment id', async () => {
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
          quantity: decimal('60'),
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
          },
        ],
      },
    };
    const posted = {
      ...pending,
      status: ShipmentStatus.POSTED,
      shippedAt: new Date(),
    };
    const finalizeTx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: 'sh1',
            status: ShipmentStatus.PENDING_STOCK,
            salesOrderId: 'so1',
          },
        ])
        .mockResolvedValueOnce([{ id: 'so1' }])
        .mockResolvedValueOnce([{ id: soItemId }]),
      shipment: {
        findFirstOrThrow: jest.fn().mockResolvedValue({
          ...pending,
          salesOrder: {
            id: 'so1',
            items: pending.salesOrder.items,
          },
        }),
        update: jest.fn().mockResolvedValue(posted),
      },
      salesOrderItem: {
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          {
            id: soItemId,
            quantity: decimal('100'),
            shippedQuantity: decimal('100'),
          },
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
      applyIssue: jest.fn().mockResolvedValue({ created: true }),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new ShipmentsService(
      prisma as never,
      inventory as never,
      audit as never,
    );

    const result = await service.post(actor, 'sh1');
    expect(inventory.applyIssue).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        referenceId: 'sh1',
        lines: [{ productId, quantity: '60.000000' }],
      }),
    );
    expect(finalizeTx.salesOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: SalesOrderStatus.FULFILLED },
      }),
    );
    expect(result.status).toBe(ShipmentStatus.POSTED);
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
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      salesOrder: { items: [] },
    };
    const prisma = {
      shipment: { findFirst: jest.fn().mockResolvedValue(existing) },
    };
    const inventory = { applyIssue: jest.fn() };
    const service = new ShipmentsService(
      prisma as never,
      inventory as never,
      { record: jest.fn() } as never,
    );
    const result = await service.post(actor, 'sh1');
    expect(result.status).toBe(ShipmentStatus.POSTED);
    expect(inventory.applyIssue).not.toHaveBeenCalled();
  });

  it('scopes getById to tenant', async () => {
    const prisma = {
      shipment: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new ShipmentsService(
      prisma as never,
      { applyIssue: jest.fn() } as never,
      { record: jest.fn() } as never,
    );
    await expect(service.getById(actor, 'sh1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.shipment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sh1', tenantId },
      }),
    );
  });
});
