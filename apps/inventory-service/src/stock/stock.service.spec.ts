import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, StockMovementType } from '../../generated/prisma-client';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { ImplementedStockAdjustmentType } from './dto/stock.dto';
import { StockService } from './stock.service';

describe('StockService', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const productId = '55555555-aaaa-4aaa-8aaa-555555555555';
  const warehouseId = '22222222-aaaa-4aaa-8aaa-222222222222';

  function movement(overrides: Record<string, unknown> = {}) {
    return {
      id: '66666666-aaaa-4aaa-8aaa-666666666666',
      tenantId: actor.tenantId,
      productId,
      warehouseId,
      type: StockMovementType.ADJUSTMENT_IN,
      quantity: new Prisma.Decimal('100'),
      referenceType: null,
      referenceId: null,
      reason: 'Opening stock',
      createdBy: actor.userId,
      createdAt: new Date('2026-01-01'),
      ...overrides,
    };
  }

  function stockRow(quantity: string) {
    return {
      id: '77777777-aaaa-4aaa-8aaa-777777777777',
      tenantId: actor.tenantId,
      productId,
      warehouseId,
      quantity: new Prisma.Decimal(quantity),
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
    };
  }

  function createService() {
    const tx = {
      $queryRaw: jest.fn(),
      stockMovement: { create: jest.fn() },
      stock: { create: jest.fn(), update: jest.fn() },
    };
    const prisma = {
      product: { findFirst: jest.fn() },
      warehouse: { findFirst: jest.fn() },
      stock: { findMany: jest.fn() },
      stockMovement: { findMany: jest.fn(), findFirst: jest.fn() },
      $transaction: jest.fn(
        async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
      ),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new StockService(
      prisma as never,
      audit as unknown as IdentityAuditClient,
    );
    return { service, prisma, tx, audit };
  }

  it('lists stock scoped to the actor tenant', async () => {
    const { service, prisma } = createService();
    prisma.stock.findMany.mockResolvedValue([stockRow('100')]);
    const result = await service.list(actor, { productId });
    expect(prisma.stock.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: actor.tenantId,
        productId,
        warehouseId: undefined,
      },
      orderBy: [{ productId: 'asc' }, { warehouseId: 'asc' }],
    });
    expect(result.items[0].quantity).toBe('100.000000');
  });

  it('creates opening stock, movement, and stock.adjusted audit', async () => {
    const { service, prisma, tx, audit } = createService();
    prisma.product.findFirst.mockResolvedValue({ id: productId });
    prisma.warehouse.findFirst.mockResolvedValue({ id: warehouseId });
    tx.$queryRaw.mockResolvedValue([]);
    tx.stockMovement.create.mockResolvedValue(
      movement({ type: StockMovementType.OPENING }),
    );
    tx.stock.create.mockResolvedValue(stockRow('100'));

    const result = await service.adjust(actor, {
      productId,
      warehouseId,
      type: ImplementedStockAdjustmentType.OPENING,
      quantity: '100',
      reason: 'Opening stock',
    });

    expect(result.stock.quantity).toBe('100.000000');
    expect(result.movement.type).toBe(StockMovementType.OPENING);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'stock.adjusted',
        metadata: expect.objectContaining({
          productId,
          warehouseId,
          type: ImplementedStockAdjustmentType.OPENING,
          quantity: '100',
          reason: 'Opening stock',
          resultingQuantity: '100',
        }),
      }),
    );
    const metadata = (audit.record as jest.Mock).mock.calls[0][0]
      .metadata as Record<string, unknown>;
    expect(JSON.stringify(metadata)).not.toMatch(
      /password|passwordHash|accessToken|refreshToken/i,
    );
  });

  it('adds on ADJUSTMENT_IN and subtracts on ADJUSTMENT_OUT', async () => {
    const { service, prisma, tx } = createService();
    prisma.product.findFirst.mockResolvedValue({ id: productId });
    prisma.warehouse.findFirst.mockResolvedValue({ id: warehouseId });
    tx.$queryRaw.mockResolvedValue([
      { id: stockRow('100').id, quantity: new Prisma.Decimal('100') },
    ]);
    tx.stockMovement.create.mockResolvedValue(movement());
    tx.stock.update.mockResolvedValue(stockRow('125'));

    const inward = await service.adjust(actor, {
      productId,
      warehouseId,
      type: ImplementedStockAdjustmentType.ADJUSTMENT_IN,
      quantity: '25',
    });
    expect(inward.stock.quantity).toBe('125.000000');

    tx.stock.update.mockResolvedValue(stockRow('105'));
    const outward = await service.adjust(actor, {
      productId,
      warehouseId,
      type: ImplementedStockAdjustmentType.ADJUSTMENT_OUT,
      quantity: '20',
    });
    expect(outward.stock.quantity).toBe('105.000000');
  });

  it('rejects ADJUSTMENT_OUT that would make stock negative', async () => {
    const { service, prisma, tx } = createService();
    prisma.product.findFirst.mockResolvedValue({ id: productId });
    prisma.warehouse.findFirst.mockResolvedValue({ id: warehouseId });
    tx.$queryRaw.mockResolvedValue([
      { id: stockRow('10').id, quantity: new Prisma.Decimal('10') },
    ]);

    await expect(
      service.adjust(actor, {
        productId,
        warehouseId,
        type: ImplementedStockAdjustmentType.ADJUSTMENT_OUT,
        quantity: '20',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.stock.update).not.toHaveBeenCalled();
  });

  it('rolls back stock when movement create fails inside the transaction', async () => {
    const { service, prisma, tx } = createService();
    prisma.product.findFirst.mockResolvedValue({ id: productId });
    prisma.warehouse.findFirst.mockResolvedValue({ id: warehouseId });
    tx.$queryRaw.mockResolvedValue([]);
    tx.stockMovement.create.mockRejectedValue(new Error('movement failed'));

    await expect(
      service.adjust(actor, {
        productId,
        warehouseId,
        type: ImplementedStockAdjustmentType.ADJUSTMENT_IN,
        quantity: '10',
      }),
    ).rejects.toThrow('movement failed');
    expect(tx.stock.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('returns 404 when product belongs to another tenant', async () => {
    const { service, prisma } = createService();
    prisma.product.findFirst.mockResolvedValue(null);
    await expect(
      service.adjust(actor, {
        productId,
        warehouseId,
        type: ImplementedStockAdjustmentType.ADJUSTMENT_IN,
        quantity: '1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists and gets movements scoped to the actor tenant', async () => {
    const { service, prisma } = createService();
    prisma.stockMovement.findMany.mockResolvedValue([movement()]);
    prisma.stockMovement.findFirst.mockResolvedValue(movement());

    await service.listMovements(actor, {
      productId,
      type: StockMovementType.ADJUSTMENT_IN,
    });
    expect(prisma.stockMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: actor.tenantId,
          productId,
          type: StockMovementType.ADJUSTMENT_IN,
        }),
      }),
    );

    await expect(
      service.getMovement(actor, movement().id),
    ).resolves.toMatchObject({ id: movement().id });
  });

  it('returns 404 for another tenant movement', async () => {
    const { service, prisma } = createService();
    prisma.stockMovement.findFirst.mockResolvedValue(null);
    await expect(
      service.getMovement(actor, movement().id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
