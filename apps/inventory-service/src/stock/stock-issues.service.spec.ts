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
      },
    ]);
    tx.stock.findFirst.mockResolvedValue({
      id: 's1',
      tenantId: actor.tenantId,
      productId: dto.lines[0].productId,
      warehouseId: dto.warehouseId,
      quantity: new Prisma.Decimal('90'),
    });

    const result = await service.apply(actor, {
      ...dto,
      lines: [{ ...dto.lines[0], quantity: '10.000000' }],
    });
    expect(result.created).toBe(false);
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.stock.update).not.toHaveBeenCalled();
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
      },
    ]);
    second.tx.stock.findFirst.mockResolvedValue({
      id: 's1',
      tenantId: actor.tenantId,
      productId: dto.lines[0].productId,
      warehouseId: dto.warehouseId,
      quantity: new Prisma.Decimal('90'),
    });

    const [a, b] = await Promise.all([
      first.service.apply(actor, dto),
      second.service.apply(actor, dto),
    ]);
    expect([a.created, b.created].sort()).toEqual([false, true]);
    expect(first.tx.stockMovement.create).toHaveBeenCalledTimes(1);
    expect(second.tx.stockMovement.create).not.toHaveBeenCalled();
  });
});
