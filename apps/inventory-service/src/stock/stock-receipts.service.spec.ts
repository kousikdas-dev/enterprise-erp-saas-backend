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

  function createService(insertReturning: unknown[]) {
    let queryCall = 0;
    const tx = {
      $queryRaw: jest.fn().mockImplementation(async () => {
        if (queryCall === 0) {
          queryCall += 1;
          return insertReturning;
        }
        queryCall += 1;
        return [];
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
    const { service, tx } = createService([{ id: 'app-1' }]);
    const result = await service.apply(actor, dto);
    expect(result.created).toBe(true);
    expect(result.movements[0].type).toBe(StockMovementType.PURCHASE);
    expect(tx.stockMovement.create).toHaveBeenCalled();
  });

  it('replays an exact receipt without creating stock again', async () => {
    const { service, tx } = createService([]);
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
      },
    ]);
    tx.stock.findFirst.mockResolvedValue({
      id: 'ssssssss-ssss-4sss-8sss-ssssssssssss',
      tenantId: actor.tenantId,
      productId: dto.lines[0].productId,
      warehouseId: dto.warehouseId,
      quantity: new Prisma.Decimal('10'),
    });

    const replay = await service.apply(actor, dto);
    expect(replay.created).toBe(false);
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('rejects payload mismatch on reused referenceId', async () => {
    const { service, tx } = createService([]);
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
});
