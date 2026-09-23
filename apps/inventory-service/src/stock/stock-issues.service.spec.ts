import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, StockMovementType } from '../../generated/prisma-client';
import {
  CreateStockIssueDto,
  stockApplicationPayloadHash,
} from './dto/stock-issue.dto';
import { StockIssuesService } from './stock-issues.service';

describe('StockIssuesService', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const dto: CreateStockIssueDto = {
    referenceType: 'shipment',
    referenceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    warehouseId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    lines: [
      {
        productId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        quantity: '10',
      },
    ],
  };
  const payloadHash = stockApplicationPayloadHash({
    warehouseId: dto.warehouseId,
    lines: [{ productId: dto.lines[0].productId, quantity: '10.000000' }],
  });

  it('treats 10 and 10.000000 as the same payload hash', () => {
    expect(
      stockApplicationPayloadHash({
        warehouseId: dto.warehouseId,
        lines: [{ productId: dto.lines[0].productId, quantity: '10' }],
      }),
    ).toBe(payloadHash);
  });

  function createService(opts: {
    insertReturning: unknown[];
    lockedQty?: string;
    lockedTotalValue?: string;
  }) {
    let queryCall = 0;
    const tx = {
      $queryRaw: jest.fn().mockImplementation(async () => {
        if (queryCall === 0) {
          queryCall += 1;
          return opts.insertReturning;
        }
        queryCall += 1;
        if (opts.lockedQty === undefined) return [];
        return [
          {
            id: 'ssssssss-ssss-4sss-8sss-ssssssssssss',
            quantity: new Prisma.Decimal(opts.lockedQty),
            totalValue: new Prisma.Decimal(opts.lockedTotalValue ?? '0'),
          },
        ];
      }),
      stockMovement: {
        create: jest.fn().mockResolvedValue({
          id: 'mmmmmmmm-mmmm-4mmm-8mmm-mmmmmmmmmmmm',
          tenantId: actor.tenantId,
          productId: dto.lines[0].productId,
          warehouseId: dto.warehouseId,
          type: StockMovementType.SALE,
          quantity: new Prisma.Decimal('10'),
          referenceType: 'shipment',
          referenceId: dto.referenceId,
          createdBy: actor.userId,
          createdAt: new Date(),
          unitCost: null,
          totalCost: null,
        }),
        findMany: jest.fn(),
      },
      stock: {
        update: jest.fn().mockResolvedValue({
          id: 'ssssssss-ssss-4sss-8sss-ssssssssssss',
          tenantId: actor.tenantId,
          productId: dto.lines[0].productId,
          warehouseId: dto.warehouseId,
          quantity: new Prisma.Decimal('90'),
          totalValue: new Prisma.Decimal('0'),
        }),
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
    return { service: new StockIssuesService(prisma as never), tx, prisma };
  }

  it('applies a new issue with SALE movement and decreases stock', async () => {
    const { service, tx } = createService({
      insertReturning: [{ id: 'app-1' }],
      lockedQty: '100',
    });
    const result = await service.apply(actor, dto);
    expect(result.created).toBe(true);
    expect(result.movements[0].type).toBe(StockMovementType.SALE);
    expect(tx.stock.update).toHaveBeenCalled();
    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: StockMovementType.SALE,
          referenceType: 'shipment',
        }),
      }),
    );
  });

  it('rejects insufficient stock with 409 semantics', async () => {
    const { service } = createService({
      insertReturning: [{ id: 'app-1' }],
      lockedQty: '5',
    });
    await expect(service.apply(actor, dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('replays exact issue without decreasing stock again', async () => {
    const { service, tx } = createService({ insertReturning: [] });
    tx.stockReceiptApplication.findFirst.mockResolvedValue({
      id: 'app-1',
      tenantId: actor.tenantId,
      referenceType: 'shipment',
      referenceId: dto.referenceId,
      warehouseId: dto.warehouseId,
      payloadHash,
    });
    tx.stockMovement.findMany.mockResolvedValue([
      {
        id: 'm1',
        tenantId: actor.tenantId,
        productId: dto.lines[0].productId,
        warehouseId: dto.warehouseId,
        type: StockMovementType.SALE,
        quantity: new Prisma.Decimal('10'),
        referenceType: 'shipment',
        referenceId: dto.referenceId,
        createdBy: actor.userId,
        createdAt: new Date(),
        unitCost: new Prisma.Decimal('10'),
        totalCost: new Prisma.Decimal('100'),
      },
    ]);
    tx.stock.findFirst.mockResolvedValue({
      id: 's1',
      tenantId: actor.tenantId,
      productId: dto.lines[0].productId,
      warehouseId: dto.warehouseId,
      quantity: new Prisma.Decimal('90'),
      totalValue: new Prisma.Decimal('900'),
    });

    const result = await service.apply(actor, {
      ...dto,
      lines: [{ ...dto.lines[0], quantity: '10.000000' }],
    });
    expect(result.created).toBe(false);
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.stock.update).not.toHaveBeenCalled();
    expect(result.stocks[0].totalValue).toBe('900.0000');
  });

  it('rejects payload mismatch on replay', async () => {
    const { service, tx } = createService({ insertReturning: [] });
    tx.stockReceiptApplication.findFirst.mockResolvedValue({
      id: 'app-1',
      tenantId: actor.tenantId,
      referenceType: 'shipment',
      referenceId: dto.referenceId,
      warehouseId: dto.warehouseId,
      payloadHash,
    });
    await expect(
      service.apply(actor, {
        ...dto,
        lines: [{ ...dto.lines[0], quantity: '11' }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects missing warehouse for tenant', async () => {
    const { service, prisma } = createService({
      insertReturning: [{ id: 'app-1' }],
      lockedQty: '100',
    });
    prisma.warehouse.findFirst.mockResolvedValue(null);
    await expect(service.apply(actor, dto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects missing product for tenant', async () => {
    const { service, prisma } = createService({
      insertReturning: [{ id: 'app-1' }],
      lockedQty: '100',
    });
    prisma.product.findFirst.mockResolvedValue(null);
    await expect(service.apply(actor, dto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rolls back when stock decrease fails after ledger insert', async () => {
    const { service, prisma } = createService({
      insertReturning: [{ id: 'app-1' }],
      lockedQty: '5',
    });
    await expect(service.apply(actor, dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('concurrent identical inserts: only winner decreases stock', async () => {
    const first = createService({
      insertReturning: [{ id: 'app-1' }],
      lockedQty: '100',
    });
    const second = createService({ insertReturning: [] });
    second.tx.stockReceiptApplication.findFirst.mockResolvedValue({
      id: 'app-1',
      tenantId: actor.tenantId,
      referenceType: 'shipment',
      referenceId: dto.referenceId,
      warehouseId: dto.warehouseId,
      payloadHash,
    });
    second.tx.stockMovement.findMany.mockResolvedValue([
      {
        id: 'm1',
        tenantId: actor.tenantId,
        productId: dto.lines[0].productId,
        warehouseId: dto.warehouseId,
        type: StockMovementType.SALE,
        quantity: new Prisma.Decimal('10'),
        referenceType: 'shipment',
        referenceId: dto.referenceId,
        createdBy: actor.userId,
        createdAt: new Date(),
        unitCost: null,
        totalCost: null,
      },
    ]);
    second.tx.stock.findFirst.mockResolvedValue({
      id: 's1',
      tenantId: actor.tenantId,
      productId: dto.lines[0].productId,
      warehouseId: dto.warehouseId,
      quantity: new Prisma.Decimal('90'),
      totalValue: new Prisma.Decimal('0'),
    });

    const [a, b] = await Promise.all([
      first.service.apply(actor, dto),
      second.service.apply(actor, dto),
    ]);
    expect([a.created, b.created].sort()).toEqual([false, true]);
    expect(first.tx.stockMovement.create).toHaveBeenCalledTimes(1);
    expect(second.tx.stockMovement.create).not.toHaveBeenCalled();
  });

  describe('Inventory Valuation V1 (Phase 2) — Moving Average on issue', () => {
    it('uses the CURRENT moving average cost, computed internally — never a client-supplied cost', async () => {
      // Stock: 100 units, totalValue 1000 -> average cost 10/unit.
      const { service, tx } = createService({
        insertReturning: [{ id: 'app-1' }],
        lockedQty: '100',
        lockedTotalValue: '1000',
      });
      tx.stock.update.mockResolvedValue({
        id: 's1',
        tenantId: actor.tenantId,
        productId: dto.lines[0].productId,
        warehouseId: dto.warehouseId,
        quantity: new Prisma.Decimal('90'),
        totalValue: new Prisma.Decimal('900'),
      });
      tx.stockMovement.create.mockResolvedValue({
        id: 'mmmmmmmm-mmmm-4mmm-8mmm-mmmmmmmmmmmm',
        tenantId: actor.tenantId,
        productId: dto.lines[0].productId,
        warehouseId: dto.warehouseId,
        type: StockMovementType.SALE,
        quantity: new Prisma.Decimal('10'),
        referenceType: 'shipment',
        referenceId: dto.referenceId,
        createdBy: actor.userId,
        createdAt: new Date(),
        unitCost: new Prisma.Decimal('10'),
        totalCost: new Prisma.Decimal('100'),
      });

      const result = await service.apply(actor, dto); // issues 10 units

      const updateCallData = (tx.stock.update as jest.Mock).mock.calls[0][0].data;
      expect((updateCallData.quantity as Prisma.Decimal).toString()).toBe('90');
      // issueValue = 10 × 10 = 100; newValue = 1000 - 100 = 900.
      expect((updateCallData.totalValue as Prisma.Decimal).toString()).toBe('900');
      expect(result.movements[0].unitCost).toBe('10.0000');
      expect(result.movements[0].totalCost).toBe('100.0000');
      expect(result.stocks[0].totalValue).toBe('900.0000');
    });

    it('snapshots unitCost/totalCost on the movement — never re-derived later from a since-changed average', async () => {
      const { tx, service } = createService({
        insertReturning: [{ id: 'app-1' }],
        lockedQty: '20',
        lockedTotalValue: '500', // average = 25/unit
      });
      tx.stockMovement.create.mockResolvedValue({
        id: 'm-issue-1',
        tenantId: actor.tenantId,
        productId: dto.lines[0].productId,
        warehouseId: dto.warehouseId,
        type: StockMovementType.SALE,
        quantity: new Prisma.Decimal('10'),
        referenceType: 'shipment',
        referenceId: dto.referenceId,
        createdBy: actor.userId,
        createdAt: new Date(),
        unitCost: new Prisma.Decimal('25'),
        totalCost: new Prisma.Decimal('250'),
      });

      await service.apply(actor, dto);

      expect(tx.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            unitCost: expect.objectContaining({}),
            totalCost: expect.objectContaining({}),
          }),
        }),
      );
      const createCallData = (tx.stockMovement.create as jest.Mock).mock.calls[0][0].data;
      expect((createCallData.unitCost as Prisma.Decimal).toString()).toBe('25');
      expect((createCallData.totalCost as Prisma.Decimal).toString()).toBe('250');
    });

    it('stock reaching exactly zero resets totalValue to exactly zero', async () => {
      // Issue the ENTIRE remaining quantity (10 of 10) — quantity lands on
      // exactly 0, so totalValue must too, regardless of division rounding.
      const { service, tx } = createService({
        insertReturning: [{ id: 'app-1' }],
        lockedQty: '10',
        lockedTotalValue: '333.3333',
      });
      tx.stock.update.mockResolvedValue({
        id: 's1',
        tenantId: actor.tenantId,
        productId: dto.lines[0].productId,
        warehouseId: dto.warehouseId,
        quantity: new Prisma.Decimal('0'),
        totalValue: new Prisma.Decimal('0'),
      });

      const result = await service.apply(actor, dto);

      const updateCallData = (tx.stock.update as jest.Mock).mock.calls[0][0].data;
      expect((updateCallData.quantity as Prisma.Decimal).toString()).toBe('0');
      expect((updateCallData.totalValue as Prisma.Decimal).toString()).toBe('0');
      expect(result.stocks[0].totalValue).toBe('0.0000');
    });

    it('negative stock remains blocked even with valuation in play', async () => {
      const { service } = createService({
        insertReturning: [{ id: 'app-1' }],
        lockedQty: '5',
        lockedTotalValue: '50',
      });
      await expect(service.apply(actor, dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });
});
