import { ConflictException } from '@nestjs/common';
import { Prisma, StockMovementType } from '../../generated/prisma-client';
import { stockReceiptPayloadHash } from './dto/stock-receipt.dto';
import { CreateStockReceiptDto } from './dto/stock-receipt.dto';
import { StockReceiptsService } from './stock-receipts.service';

describe('StockReceiptsService', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const dto: CreateStockReceiptDto = {
    referenceType: 'goods_receipt',
    referenceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    warehouseId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    lines: [
      {
        productId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        quantity: '10',
      },
    ],
  };
  const payloadHash = stockReceiptPayloadHash({
    warehouseId: dto.warehouseId,
    lines: dto.lines,
  });

  function createService(opts: {
    insertReturning: unknown[];
    lockedRow?: { quantity: string; totalValue: string };
  }) {
    let queryCall = 0;
    const tx = {
      $queryRaw: jest.fn().mockImplementation(async () => {
        if (queryCall === 0) {
          queryCall += 1;
          return opts.insertReturning;
        }
        queryCall += 1;
        if (!opts.lockedRow) return [];
        return [
          {
            id: 'ssssssss-ssss-4sss-8sss-ssssssssssss',
            quantity: new Prisma.Decimal(opts.lockedRow.quantity),
            totalValue: new Prisma.Decimal(opts.lockedRow.totalValue),
          },
        ];
      }),
      stockMovement: {
        create: jest.fn().mockResolvedValue({
          id: 'mmmmmmmm-mmmm-4mmm-8mmm-mmmmmmmmmmmm',
          tenantId: actor.tenantId,
          productId: dto.lines[0].productId,
          warehouseId: dto.warehouseId,
          type: StockMovementType.PURCHASE,
          quantity: new Prisma.Decimal('10'),
          referenceType: 'goods_receipt',
          referenceId: dto.referenceId,
          createdBy: actor.userId,
          createdAt: new Date(),
          unitCost: null,
          totalCost: null,
        }),
        findMany: jest.fn(),
      },
      stock: {
        create: jest.fn().mockResolvedValue({
          id: 'ssssssss-ssss-4sss-8sss-ssssssssssss',
          tenantId: actor.tenantId,
          productId: dto.lines[0].productId,
          warehouseId: dto.warehouseId,
          quantity: new Prisma.Decimal('10'),
          totalValue: new Prisma.Decimal('0'),
        }),
        update: jest.fn(),
        findFirst: jest.fn(),
      },
      stockReceiptApplication: { findFirst: jest.fn() },
    };
    const prisma = {
      warehouse: {
        findFirst: jest.fn().mockResolvedValue({ id: dto.warehouseId }),
      },
      product: {
        findFirst: jest.fn().mockResolvedValue({ id: dto.lines[0].productId }),
      },
      $transaction: jest.fn(
        async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
      ),
    };
    return {
      service: new StockReceiptsService(prisma as never),
      tx,
    };
  }

  it('applies a new receipt with PURCHASE movement', async () => {
    const { service, tx } = createService({ insertReturning: [{ id: 'app-1' }] });
    const result = await service.apply(actor, dto);
    expect(result.created).toBe(true);
    expect(result.movements[0].type).toBe(StockMovementType.PURCHASE);
    expect(tx.stockMovement.create).toHaveBeenCalled();
  });

  it('replays an exact receipt without creating stock again', async () => {
    const { service, tx } = createService({ insertReturning: [] });
    tx.stockReceiptApplication.findFirst.mockResolvedValue({
      id: 'app-1',
      tenantId: actor.tenantId,
      referenceType: 'goods_receipt',
      referenceId: dto.referenceId,
      warehouseId: dto.warehouseId,
      payloadHash,
    });
    tx.stockMovement.findMany.mockResolvedValue([
      {
        id: 'mmmmmmmm-mmmm-4mmm-8mmm-mmmmmmmmmmmm',
        tenantId: actor.tenantId,
        productId: dto.lines[0].productId,
        warehouseId: dto.warehouseId,
        type: StockMovementType.PURCHASE,
        quantity: new Prisma.Decimal('10'),
        referenceType: 'goods_receipt',
        referenceId: dto.referenceId,
        createdBy: actor.userId,
        createdAt: new Date(),
        unitCost: null,
        totalCost: null,
      },
    ]);
    tx.stock.findFirst.mockResolvedValue({
      id: 'ssssssss-ssss-4sss-8sss-ssssssssssss',
      tenantId: actor.tenantId,
      productId: dto.lines[0].productId,
      warehouseId: dto.warehouseId,
      quantity: new Prisma.Decimal('10'),
      totalValue: new Prisma.Decimal('0'),
    });

    const replay = await service.apply(actor, dto);
    expect(replay.created).toBe(false);
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(replay.stocks[0].totalValue).toBe('0.0000');
  });

  it('rejects payload mismatch on reused referenceId', async () => {
    const { service, tx } = createService({ insertReturning: [] });
    tx.stockReceiptApplication.findFirst.mockResolvedValue({
      id: 'app-1',
      tenantId: actor.tenantId,
      referenceType: 'goods_receipt',
      referenceId: dto.referenceId,
      warehouseId: dto.warehouseId,
      payloadHash: 'different-hash',
    });
    await expect(service.apply(actor, dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  describe('Inventory Valuation V1 (Phase 2) — Moving Average on receipt', () => {
    it('a receipt without unitCost leaves totalValue at 0 (backward compatible)', async () => {
      const { service, tx } = createService({ insertReturning: [{ id: 'app-1' }] });
      const result = await service.apply(actor, dto);
      expect(result.stocks[0].totalValue).toBe('0.0000');
      expect(result.movements[0].unitCost).toBeNull();
      expect(result.movements[0].totalCost).toBeNull();
      expect(tx.stock.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ totalValue: expect.anything() }) }),
      );
    });

    it('a fresh receipt with unitCost computes totalValue = quantity × unitCost and snapshots the movement', async () => {
      const { service, tx } = createService({ insertReturning: [{ id: 'app-1' }] });
      tx.stock.create.mockResolvedValue({
        id: 'ssssssss-ssss-4sss-8sss-ssssssssssss',
        tenantId: actor.tenantId,
        productId: dto.lines[0].productId,
        warehouseId: dto.warehouseId,
        quantity: new Prisma.Decimal('10'),
        totalValue: new Prisma.Decimal('500'),
      });
      tx.stockMovement.create.mockResolvedValue({
        id: 'mmmmmmmm-mmmm-4mmm-8mmm-mmmmmmmmmmmm',
        tenantId: actor.tenantId,
        productId: dto.lines[0].productId,
        warehouseId: dto.warehouseId,
        type: StockMovementType.PURCHASE,
        quantity: new Prisma.Decimal('10'),
        referenceType: 'goods_receipt',
        referenceId: dto.referenceId,
        createdBy: actor.userId,
        createdAt: new Date(),
        unitCost: new Prisma.Decimal('50'),
        totalCost: new Prisma.Decimal('500'),
      });

      const result = await service.apply(actor, {
        ...dto,
        lines: [{ ...dto.lines[0], unitCost: '50' }],
      });

      const createCallData = (tx.stock.create as jest.Mock).mock.calls[0][0].data;
      expect((createCallData.totalValue as Prisma.Decimal).toString()).toBe('500');
      expect(result.stocks[0].totalValue).toBe('500.0000');
      expect(result.movements[0].unitCost).toBe('50.0000');
      expect(result.movements[0].totalCost).toBe('500.0000');
    });

    it('multiple receipts at different costs blend into the correct moving average', async () => {
      // Receipt 1: 10 units @ 50 into an empty Stock -> totalValue 500.
      const first = createService({ insertReturning: [{ id: 'app-1' }] });
      first.tx.stock.create.mockResolvedValue({
        id: 's1',
        tenantId: actor.tenantId,
        productId: dto.lines[0].productId,
        warehouseId: dto.warehouseId,
        quantity: new Prisma.Decimal('10'),
        totalValue: new Prisma.Decimal('500'),
      });
      const firstResult = await first.service.apply(actor, {
        ...dto,
        lines: [{ ...dto.lines[0], unitCost: '50' }],
      });
      expect(firstResult.stocks[0].totalValue).toBe('500.0000');

      // Receipt 2: 10 more units @ 70 on top of the existing 10 @ effectively
      // 50 -> newValue = 500 + (10 × 70) = 1200, newQty = 20.
      const second = createService({
        insertReturning: [{ id: 'app-2' }],
        lockedRow: { quantity: '10', totalValue: '500' },
      });
      second.tx.stock.update.mockResolvedValue({
        id: 's1',
        tenantId: actor.tenantId,
        productId: dto.lines[0].productId,
        warehouseId: dto.warehouseId,
        quantity: new Prisma.Decimal('20'),
        totalValue: new Prisma.Decimal('1200'),
      });
      const secondResult = await second.service.apply(actor, {
        ...dto,
        referenceId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        lines: [{ ...dto.lines[0], quantity: '10', unitCost: '70' }],
      });

      const updateCallData = (second.tx.stock.update as jest.Mock).mock.calls[0][0].data;
      expect((updateCallData.totalValue as Prisma.Decimal).toString()).toBe('1200');
      expect((updateCallData.quantity as Prisma.Decimal).toString()).toBe('20');
      expect(secondResult.stocks[0].totalValue).toBe('1200.0000');
      // Average cost after both receipts: 1200 / 20 = 60 — exactly the
      // moving average of 50 and 70 weighted by equal quantities.
      expect(
        new Prisma.Decimal(updateCallData.totalValue as Prisma.Decimal)
          .div(updateCallData.quantity as Prisma.Decimal)
          .toString(),
      ).toBe('60');
    });
  });
});
