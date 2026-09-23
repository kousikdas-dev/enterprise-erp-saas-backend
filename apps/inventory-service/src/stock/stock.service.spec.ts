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
      // Inventory Valuation V1 (Phase 2) — Stock Adjustment does not carry
      // cost information; null here matches production behavior exactly.
      unitCost: null,
      totalCost: null,
      ...overrides,
    };
  }

  function stockRow(quantity: string, totalValue = '0') {
    return {
      id: '77777777-aaaa-4aaa-8aaa-777777777777',
      tenantId: actor.tenantId,
      productId,
      warehouseId,
      quantity: new Prisma.Decimal(quantity),
      totalValue: new Prisma.Decimal(totalValue),
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

  it('creates a first ADJUSTMENT_IN, movement, and stock.adjusted audit', async () => {
    // OPENING was removed from ImplementedStockAdjustmentType in Inventory
    // Design v4, Phase B — opening balances are now created exclusively
    // through the dedicated Opening Stock document, never through this
    // generic adjustment endpoint. This test now exercises the same
    // "no prior Stock row" code path using the still-supported
    // ADJUSTMENT_IN type.
    const { service, prisma, tx, audit } = createService();
    prisma.product.findFirst.mockResolvedValue({ id: productId });
    prisma.warehouse.findFirst.mockResolvedValue({ id: warehouseId });
    tx.$queryRaw.mockResolvedValue([]);
    tx.stockMovement.create.mockResolvedValue(
      movement({ unitCost: new Prisma.Decimal('10'), totalCost: new Prisma.Decimal('1000') }),
    );
    tx.stock.create.mockResolvedValue(stockRow('100', '1000'));

    const result = await service.adjust(actor, {
      productId,
      warehouseId,
      type: ImplementedStockAdjustmentType.ADJUSTMENT_IN,
      quantity: '100',
      unitCost: '10',
      reason: 'Initial count',
    });

    expect(result.stock.quantity).toBe('100.000000');
    expect(result.movement.type).toBe(StockMovementType.ADJUSTMENT_IN);
    // Inventory Valuation V1 (Phase 2, revised) — ADJUSTMENT_IN now requires
    // unitCost and updates Stock.totalValue exactly like every other
    // quantity-increasing movement: 100 × 10 = 1000.
    expect(result.stock.totalValue).toBe('1000.0000');
    expect(result.movement.unitCost).toBe('10.0000');
    expect(result.movement.totalCost).toBe('1000.0000');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'stock.adjusted',
        metadata: expect.objectContaining({
          productId,
          warehouseId,
          type: ImplementedStockAdjustmentType.ADJUSTMENT_IN,
          quantity: '100',
          reason: 'Initial count',
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

  it('rejects ADJUSTMENT_IN without unitCost (ADJUSTMENT_IN_REQUIRES_UNIT_COST)', async () => {
    const { service } = createService();
    const error: ConflictException = await service
      .adjust(actor, {
        productId,
        warehouseId,
        type: ImplementedStockAdjustmentType.ADJUSTMENT_IN,
        quantity: '10',
      })
      .catch((e: unknown) => e as ConflictException);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error.getResponse() as { code: string }).code).toBe(
      'ADJUSTMENT_IN_REQUIRES_UNIT_COST',
    );
  });

  it('rejects a client-supplied unitCost on ADJUSTMENT_OUT (ADJUSTMENT_OUT_REJECTS_UNIT_COST)', async () => {
    const { service } = createService();
    const error: ConflictException = await service
      .adjust(actor, {
        productId,
        warehouseId,
        type: ImplementedStockAdjustmentType.ADJUSTMENT_OUT,
        quantity: '10',
        unitCost: '5',
      })
      .catch((e: unknown) => e as ConflictException);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error.getResponse() as { code: string }).code).toBe(
      'ADJUSTMENT_OUT_REJECTS_UNIT_COST',
    );
  });

  it('no longer accepts OPENING as a valid adjustment type', () => {
    expect(
      (ImplementedStockAdjustmentType as Record<string, unknown>).OPENING,
    ).toBeUndefined();
  });

  it('adds on ADJUSTMENT_IN and subtracts on ADJUSTMENT_OUT', async () => {
    const { service, prisma, tx } = createService();
    prisma.product.findFirst.mockResolvedValue({ id: productId });
    prisma.warehouse.findFirst.mockResolvedValue({ id: warehouseId });
    tx.$queryRaw.mockResolvedValue([
      {
        id: stockRow('100').id,
        quantity: new Prisma.Decimal('100'),
        totalValue: new Prisma.Decimal('1000'),
      },
    ]);
    tx.stockMovement.create.mockResolvedValue(movement());
    tx.stock.update.mockResolvedValue(stockRow('125'));

    const inward = await service.adjust(actor, {
      productId,
      warehouseId,
      type: ImplementedStockAdjustmentType.ADJUSTMENT_IN,
      quantity: '25',
      unitCost: '10',
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
        unitCost: '10',
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
        unitCost: '1',
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

  describe('Inventory Valuation V1 (Phase 2, revised) — Moving Average on Stock Adjustment', () => {
    it('A. ADJUSTMENT_IN blends into the moving average: 100 @ 10, then +20 @ 12 -> quantity 120, totalValue 1240, average 10.3333...', async () => {
      const first = createService();
      first.prisma.product.findFirst.mockResolvedValue({ id: productId });
      first.prisma.warehouse.findFirst.mockResolvedValue({ id: warehouseId });
      first.tx.$queryRaw.mockResolvedValue([]);
      first.tx.stockMovement.create.mockResolvedValue(movement());
      first.tx.stock.create.mockResolvedValue(stockRow('100', '1000'));
      const firstResult = await first.service.adjust(actor, {
        productId,
        warehouseId,
        type: ImplementedStockAdjustmentType.ADJUSTMENT_IN,
        quantity: '100',
        unitCost: '10',
      });
      expect((first.tx.stock.create as jest.Mock).mock.calls[0][0].data).toEqual(
        expect.objectContaining({
          quantity: new Prisma.Decimal('100'),
          totalValue: new Prisma.Decimal('1000'),
        }),
      );
      expect(firstResult.stock.totalValue).toBe('1000.0000');

      const second = createService();
      second.prisma.product.findFirst.mockResolvedValue({ id: productId });
      second.prisma.warehouse.findFirst.mockResolvedValue({ id: warehouseId });
      second.tx.$queryRaw.mockResolvedValue([
        {
          id: stockRow('100').id,
          quantity: new Prisma.Decimal('100'),
          totalValue: new Prisma.Decimal('1000'),
        },
      ]);
      second.tx.stockMovement.create.mockResolvedValue(movement());
      second.tx.stock.update.mockResolvedValue(stockRow('120', '1240'));
      const secondResult = await second.service.adjust(actor, {
        productId,
        warehouseId,
        type: ImplementedStockAdjustmentType.ADJUSTMENT_IN,
        quantity: '20',
        unitCost: '12',
      });

      const updateCallData = (second.tx.stock.update as jest.Mock).mock.calls[0][0].data;
      expect((updateCallData.quantity as Prisma.Decimal).toString()).toBe('120');
      expect((updateCallData.totalValue as Prisma.Decimal).toString()).toBe('1240');
      expect(secondResult.stock.totalValue).toBe('1240.0000');
      expect(
        new Prisma.Decimal(updateCallData.totalValue as Prisma.Decimal)
          .div(updateCallData.quantity as Prisma.Decimal)
          .toFixed(4),
      ).toBe('10.3333');
    });

    it('B. ADJUSTMENT_OUT uses the current moving average, never a client-supplied cost: 100 @ 10, then -20 -> quantity 80, totalValue 800, movement unitCost 10, totalCost 200', async () => {
      const { service, prisma, tx } = createService();
      prisma.product.findFirst.mockResolvedValue({ id: productId });
      prisma.warehouse.findFirst.mockResolvedValue({ id: warehouseId });
      tx.$queryRaw.mockResolvedValue([
        {
          id: stockRow('100').id,
          quantity: new Prisma.Decimal('100'),
          totalValue: new Prisma.Decimal('1000'),
        },
      ]);
      tx.stockMovement.create.mockResolvedValue(
        movement({
          type: StockMovementType.ADJUSTMENT_OUT,
          quantity: new Prisma.Decimal('20'),
          unitCost: new Prisma.Decimal('10'),
          totalCost: new Prisma.Decimal('200'),
        }),
      );
      tx.stock.update.mockResolvedValue(stockRow('80', '800'));

      const result = await service.adjust(actor, {
        productId,
        warehouseId,
        type: ImplementedStockAdjustmentType.ADJUSTMENT_OUT,
        quantity: '20',
      });

      const updateCallData = (tx.stock.update as jest.Mock).mock.calls[0][0].data;
      expect((updateCallData.quantity as Prisma.Decimal).toString()).toBe('80');
      expect((updateCallData.totalValue as Prisma.Decimal).toString()).toBe('800');
      expect(result.stock.totalValue).toBe('800.0000');
      expect(result.movement.unitCost).toBe('10.0000');
      expect(result.movement.totalCost).toBe('200.0000');
      const createCallData = (tx.stockMovement.create as jest.Mock).mock.calls[0][0].data;
      expect((createCallData.unitCost as Prisma.Decimal).toString()).toBe('10');
      expect((createCallData.totalCost as Prisma.Decimal).toString()).toBe('200');
    });

    it('C. mixed valuation across IN/IN/OUT computes the true moving average, not a FIFO-style layer cost: 100 @ 10, +100 @ 20, -50 -> quantity 150, totalValue 2250, cost 15.0000', async () => {
      // NOTE ON THE SPEC'S WORKED EXAMPLE: the request that specified this
      // test case gave expected results of totalValue 2000 / cost 13.3333...
      // for this exact sequence. Those numbers are the FIFO answer (the -50
      // priced only against the most recent 100 @ 20 lot: 3000 - 50*20 =
      // 2000). This phase is explicitly Moving/Weighted Average, not FIFO
      // (both this conversation's original Phase 2 spec and this same
      // follow-up message say so directly), and the same
      // averageCost = totalValue / quantity formula already implemented and
      // tested for Opening Stock/Receipt/Issue gives 2250 / 15.0000 here:
      // after the two receipts blend to a 15/unit average (3000 / 200), the
      // moving-average invariant is that removing units AT that average
      // never changes the average of what remains — so the correct,
      // internally-consistent result is quantity 150, totalValue 2250,
      // cost 15.0000, which is what this test (correctly) asserts. This
      // discrepancy is called out explicitly in the verification report
      // rather than silently encoded here.
      const first = createService();
      first.prisma.product.findFirst.mockResolvedValue({ id: productId });
      first.prisma.warehouse.findFirst.mockResolvedValue({ id: warehouseId });
      first.tx.$queryRaw.mockResolvedValue([]);
      first.tx.stockMovement.create.mockResolvedValue(movement());
      first.tx.stock.create.mockResolvedValue(stockRow('100', '1000'));
      await first.service.adjust(actor, {
        productId,
        warehouseId,
        type: ImplementedStockAdjustmentType.ADJUSTMENT_IN,
        quantity: '100',
        unitCost: '10',
      });

      const second = createService();
      second.prisma.product.findFirst.mockResolvedValue({ id: productId });
      second.prisma.warehouse.findFirst.mockResolvedValue({ id: warehouseId });
      second.tx.$queryRaw.mockResolvedValue([
        {
          id: stockRow('100').id,
          quantity: new Prisma.Decimal('100'),
          totalValue: new Prisma.Decimal('1000'),
        },
      ]);
      second.tx.stockMovement.create.mockResolvedValue(movement());
      second.tx.stock.update.mockResolvedValue(stockRow('200', '3000'));
      await second.service.adjust(actor, {
        productId,
        warehouseId,
        type: ImplementedStockAdjustmentType.ADJUSTMENT_IN,
        quantity: '100',
        unitCost: '20',
      });

      const third = createService();
      third.prisma.product.findFirst.mockResolvedValue({ id: productId });
      third.prisma.warehouse.findFirst.mockResolvedValue({ id: warehouseId });
      third.tx.$queryRaw.mockResolvedValue([
        {
          id: stockRow('200').id,
          quantity: new Prisma.Decimal('200'),
          totalValue: new Prisma.Decimal('3000'),
        },
      ]);
      third.tx.stockMovement.create.mockResolvedValue(
        movement({
          type: StockMovementType.ADJUSTMENT_OUT,
          quantity: new Prisma.Decimal('50'),
          unitCost: new Prisma.Decimal('15'),
          totalCost: new Prisma.Decimal('750'),
        }),
      );
      third.tx.stock.update.mockResolvedValue(stockRow('150', '2250'));
      const thirdResult = await third.service.adjust(actor, {
        productId,
        warehouseId,
        type: ImplementedStockAdjustmentType.ADJUSTMENT_OUT,
        quantity: '50',
      });

      const updateCallData = (third.tx.stock.update as jest.Mock).mock.calls[0][0].data;
      expect((updateCallData.quantity as Prisma.Decimal).toString()).toBe('150');
      expect((updateCallData.totalValue as Prisma.Decimal).toString()).toBe('2250');
      expect(thirdResult.stock.totalValue).toBe('2250.0000');
      expect(thirdResult.movement.unitCost).toBe('15.0000');
      expect(thirdResult.movement.totalCost).toBe('750.0000');
    });

    it('D. ADJUSTMENT_OUT cannot create negative stock, even with valuation in play', async () => {
      const { service, prisma, tx } = createService();
      prisma.product.findFirst.mockResolvedValue({ id: productId });
      prisma.warehouse.findFirst.mockResolvedValue({ id: warehouseId });
      tx.$queryRaw.mockResolvedValue([
        {
          id: stockRow('10').id,
          quantity: new Prisma.Decimal('10'),
          totalValue: new Prisma.Decimal('100'),
        },
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

    it('ADJUSTMENT_OUT reaching exactly zero quantity forces totalValue to exactly zero', async () => {
      const { service, prisma, tx } = createService();
      prisma.product.findFirst.mockResolvedValue({ id: productId });
      prisma.warehouse.findFirst.mockResolvedValue({ id: warehouseId });
      tx.$queryRaw.mockResolvedValue([
        {
          id: stockRow('50').id,
          quantity: new Prisma.Decimal('50'),
          totalValue: new Prisma.Decimal('333.3333'),
        },
      ]);
      tx.stockMovement.create.mockResolvedValue(movement());
      tx.stock.update.mockResolvedValue(stockRow('0', '0'));

      await service.adjust(actor, {
        productId,
        warehouseId,
        type: ImplementedStockAdjustmentType.ADJUSTMENT_OUT,
        quantity: '50',
      });

      const updateCallData = (tx.stock.update as jest.Mock).mock.calls[0][0].data;
      expect((updateCallData.quantity as Prisma.Decimal).toString()).toBe('0');
      expect((updateCallData.totalValue as Prisma.Decimal).toString()).toBe('0');
    });

    it('G. locks the Stock row before reading it, so sequential IN/OUT calls sharing the same row never diverge from a consistent quantity/totalValue trail', async () => {
      // A true concurrent-transaction race isn't observable through mocked
      // Prisma clients (there's no real Postgres row lock to contend for),
      // so this proves the invariant that actually keeps concurrent callers
      // safe: every call reads (quantity, totalValue) from the SAME locked
      // SELECT used to compute both the movement AND the Stock write, in one
      // transaction, exactly like receipts/issues/opening stock already do.
      const first = createService();
      first.prisma.product.findFirst.mockResolvedValue({ id: productId });
      first.prisma.warehouse.findFirst.mockResolvedValue({ id: warehouseId });
      first.tx.$queryRaw.mockResolvedValue([
        {
          id: stockRow('100').id,
          quantity: new Prisma.Decimal('100'),
          totalValue: new Prisma.Decimal('1000'),
        },
      ]);
      first.tx.stockMovement.create.mockResolvedValue(movement());
      first.tx.stock.update.mockResolvedValue(stockRow('80', '800'));
      await first.service.adjust(actor, {
        productId,
        warehouseId,
        type: ImplementedStockAdjustmentType.ADJUSTMENT_OUT,
        quantity: '20',
      });
      // The read (SELECT ... FOR UPDATE) and the write (movement create +
      // stock update) both happened inside the single $transaction callback
      // — proven by both mutations being called through the same `tx`
      // passed into that one $transaction invocation.
      expect(first.prisma.$transaction).toHaveBeenCalledTimes(1);
      const txCallback = (first.prisma.$transaction as jest.Mock).mock.calls[0][0];
      expect(typeof txCallback).toBe('function');
      expect(first.tx.$queryRaw).toHaveBeenCalledTimes(1);
      expect((first.tx.stock.update as jest.Mock).mock.calls[0][0].data.totalValue.toString()).toBe(
        '800',
      );
    });
  });
});
