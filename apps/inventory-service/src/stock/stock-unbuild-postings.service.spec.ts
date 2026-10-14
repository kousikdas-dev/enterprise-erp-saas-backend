import { ConflictException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Prisma, StockMovementType } from '../../generated/prisma-client';
import { unbuildPostingPayloadHash } from './dto/stock-unbuild-posting.dto';
import { CreateUnbuildPostingDto } from './dto/stock-unbuild-posting.dto';
import { StockUnbuildPostingsService } from './stock-unbuild-postings.service';

describe('StockUnbuildPostingsService', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const warehouseId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const referenceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const fgProductId = 'f0000000-0000-4000-8000-000000000000';
  const legProductId = 'c0000000-0000-4000-8000-000000000000';
  const tabletopProductId = 'c1111111-0000-4000-8000-000000000000';

  const dto: CreateUnbuildPostingDto = {
    referenceType: 'unbuild_order',
    referenceId,
    warehouseId,
    finishedGood: { productId: fgProductId, quantity: '2' },
    components: [
      { productId: legProductId, quantity: '8' },
      { productId: tabletopProductId, quantity: '2' },
    ],
  };
  const payloadHash = unbuildPostingPayloadHash({
    warehouseId: dto.warehouseId,
    finishedGood: dto.finishedGood,
    components: dto.components,
  });

  const stockRows: Record<string, { id: string; quantity: string; totalValue: string } | null> = {
    [fgProductId]: { id: 'stock-fg', quantity: '10', totalValue: '2000.0000' },
    [legProductId]: { id: 'stock-leg', quantity: '50', totalValue: '500.0000' },
    [tabletopProductId]: { id: 'stock-tabletop', quantity: '5', totalValue: '250.0000' },
  };
  const costPrices: Record<string, string> = {
    [legProductId]: '8.0000',
    [tabletopProductId]: '60.0000',
  };

  function createService(opts: { insertReturning: unknown[] }) {
    const movementCreateCalls: Array<Record<string, unknown>> = [];
    const stockUpdateCalls: Array<Record<string, unknown>> = [];

    const tx = {
      $queryRaw: jest.fn().mockImplementation(async (sql: { values: unknown[] }) => {
        // First call is always the idempotency-ledger insert.
        if (tx.$queryRaw.mock.calls.length === 1) {
          return opts.insertReturning;
        }
        // Every subsequent call is a `SELECT ... FOR UPDATE` on stocks,
        // keyed by productId — pulled out of the raw SQL's bound values.
        const productId = sql.values.find((v) => typeof v === 'string' && v in stockRows);
        const row = productId ? stockRows[productId as string] : null;
        if (!row) return [];
        return [
          {
            id: row.id,
            quantity: new Prisma.Decimal(row.quantity),
            totalValue: new Prisma.Decimal(row.totalValue),
          },
        ];
      }),
      stockMovement: {
        create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          movementCreateCalls.push(data);
          return {
            id: `movement-${movementCreateCalls.length}`,
            ...data,
          };
        }),
        findMany: jest.fn(),
      },
      stock: {
        update: jest.fn().mockImplementation(async (args: Record<string, unknown>) => {
          stockUpdateCalls.push(args);
          return args;
        }),
        create: jest.fn(),
        findFirst: jest.fn(),
      },
      product: {
        findFirst: jest.fn().mockImplementation(async ({ where }: { where: { id: string } }) => {
          if (where.id === fgProductId) return { costPrice: new Prisma.Decimal('0') };
          if (!(where.id in costPrices)) return null;
          return { costPrice: new Prisma.Decimal(costPrices[where.id]) };
        }),
      },
      stockReceiptApplication: { findFirst: jest.fn() },
    };
    const prisma = {
      warehouse: { findFirst: jest.fn().mockResolvedValue({ id: warehouseId }) },
      product: {
        findFirst: jest.fn().mockResolvedValue({ id: fgProductId }),
      },
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    return {
      service: new StockUnbuildPostingsService(prisma as never),
      tx,
      movementCreateCalls,
      stockUpdateCalls,
    };
  }

  it('posts an UNBUILD_ISSUE and the expected UNBUILD_RETURN movements with exact value conservation', async () => {
    const { service, movementCreateCalls } = createService({ insertReturning: [{ id: 'app-1' }] });
    const result = await service.apply(actor, dto);

    expect(result.created).toBe(true);
    expect(result.finishedGoodsMovement.quantity).toBe('2.000000');
    expect(result.finishedGoodsMovement.totalCost).toBe('400.0000');
    expect(result.finishedGoodsMovement.unitCost).toBe('200.0000');

    expect(result.componentMovements).toHaveLength(2);
    const leg = result.componentMovements.find((m) => m.productId === legProductId)!;
    const tabletop = result.componentMovements.find((m) => m.productId === tabletopProductId)!;
    // weight(leg) = 8*8=64, weight(tabletop)=2*60=120, total=184
    // leg share (floored, non-last by sorted productId) = floor(400*64/184,4dp)
    expect(leg.totalCost).toBe('139.1304');
    // tabletop (last, residual) = 400 - 139.1304
    expect(tabletop.totalCost).toBe('260.8696');

    const sumOfComponentValue = new Prisma.Decimal(leg.totalCost).plus(tabletop.totalCost);
    expect(sumOfComponentValue.toFixed(4)).toBe('400.0000');
    expect(sumOfComponentValue.toFixed(4)).toBe(result.finishedGoodsMovement.totalCost);

    const issueMovement = movementCreateCalls.find((m) => m.type === StockMovementType.UNBUILD_ISSUE);
    expect(issueMovement).toBeDefined();
    const returnMovements = movementCreateCalls.filter(
      (m) => m.type === StockMovementType.UNBUILD_RETURN,
    );
    expect(returnMovements).toHaveLength(2);
  });

  it('rolls back the entire transaction (including the idempotency ledger insert) on insufficient finished-goods stock', async () => {
    const insufficientStockRows = { ...stockRows, [fgProductId]: { id: 'stock-fg', quantity: '1', totalValue: '200.0000' } };
    Object.assign(stockRows, insufficientStockRows);
    const { service, tx } = createService({ insertReturning: [{ id: 'app-1' }] });

    await expect(service.apply(actor, dto)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.stockMovement.create).not.toHaveBeenCalled();

    // restore for subsequent tests
    stockRows[fgProductId] = { id: 'stock-fg', quantity: '10', totalValue: '2000.0000' };
  });

  it('replays an exact posting without creating movements again, returning the same movement IDs', async () => {
    const { service, tx } = createService({ insertReturning: [] });
    tx.stockReceiptApplication.findFirst.mockResolvedValue({
      id: 'app-1',
      tenantId: actor.tenantId,
      referenceType: 'unbuild_order',
      referenceId,
      warehouseId,
      payloadHash,
    });
    tx.stockMovement.findMany.mockResolvedValue([
      {
        id: 'movement-fg',
        productId: fgProductId,
        type: StockMovementType.UNBUILD_ISSUE,
        quantity: new Prisma.Decimal('2'),
        unitCost: new Prisma.Decimal('200.0000'),
        totalCost: new Prisma.Decimal('400.0000'),
      },
      {
        id: 'movement-leg',
        productId: legProductId,
        type: StockMovementType.UNBUILD_RETURN,
        quantity: new Prisma.Decimal('8'),
        unitCost: new Prisma.Decimal('17.3913'),
        totalCost: new Prisma.Decimal('139.1304'),
      },
      {
        id: 'movement-tabletop',
        productId: tabletopProductId,
        type: StockMovementType.UNBUILD_RETURN,
        quantity: new Prisma.Decimal('2'),
        unitCost: new Prisma.Decimal('130.4348'),
        totalCost: new Prisma.Decimal('260.8696'),
      },
    ]);

    const replay = await service.apply(actor, dto);
    expect(replay.created).toBe(false);
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(replay.finishedGoodsMovement.id).toBe('movement-fg');
    expect(replay.componentMovements.map((m) => m.id)).toEqual(['movement-leg', 'movement-tabletop']);
  });

  it('rejects a reused referenceId whose payload hash does not match', async () => {
    const { service, tx } = createService({ insertReturning: [] });
    tx.stockReceiptApplication.findFirst.mockResolvedValue({
      id: 'app-1',
      tenantId: actor.tenantId,
      referenceType: 'unbuild_order',
      referenceId,
      warehouseId,
      payloadHash: 'different-hash',
    });
    await expect(service.apply(actor, dto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('fails safely on replay when the persisted movement set does not match the expected identities', async () => {
    const { service, tx } = createService({ insertReturning: [] });
    tx.stockReceiptApplication.findFirst.mockResolvedValue({
      id: 'app-1',
      tenantId: actor.tenantId,
      referenceType: 'unbuild_order',
      referenceId,
      warehouseId,
      payloadHash,
    });
    // Missing the tabletop UNBUILD_RETURN row entirely — a corrupted/partial
    // replay that must never be silently accepted.
    tx.stockMovement.findMany.mockResolvedValue([
      {
        id: 'movement-fg',
        productId: fgProductId,
        type: StockMovementType.UNBUILD_ISSUE,
        quantity: new Prisma.Decimal('2'),
        unitCost: new Prisma.Decimal('200.0000'),
        totalCost: new Prisma.Decimal('400.0000'),
      },
      {
        id: 'movement-leg',
        productId: legProductId,
        type: StockMovementType.UNBUILD_RETURN,
        quantity: new Prisma.Decimal('8'),
        unitCost: new Prisma.Decimal('17.3913'),
        totalCost: new Prisma.Decimal('139.1304'),
      },
    ]);

    await expect(service.apply(actor, dto)).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  describe('deadlock retry', () => {
    function createRetryTestService(transactionImpl: jest.Mock) {
      const prisma = {
        warehouse: { findFirst: jest.fn().mockResolvedValue({ id: warehouseId }) },
        product: { findFirst: jest.fn().mockResolvedValue({ id: fgProductId }) },
        $transaction: transactionImpl,
      };
      return new StockUnbuildPostingsService(prisma as never);
    }

    function deadlockError(): Error & { code: string; meta: { code: string; message: string } } {
      return Object.assign(new Error('Raw query failed'), {
        code: 'P2010',
        meta: { code: '40P01', message: 'ERROR: deadlock detected\nDETAIL: ...' },
      });
    }

    const successResult = {
      created: true,
      referenceType: 'unbuild_order',
      referenceId,
      warehouseId,
      finishedGoodsMovement: { id: 'movement-fg', productId: fgProductId, quantity: '2.000000', unitCost: '200.0000', totalCost: '400.0000' },
      componentMovements: [],
    };

    it('retries a confirmed Postgres deadlock (P2010 / 40P01) and succeeds on a later attempt, replaying the same dto/referenceId', async () => {
      const transactionImpl = jest
        .fn()
        .mockRejectedValueOnce(deadlockError())
        .mockRejectedValueOnce(deadlockError())
        .mockResolvedValueOnce(successResult);
      const service = createRetryTestService(transactionImpl);

      const result = await service.apply(actor, dto);

      expect(result).toBe(successResult);
      expect(transactionImpl).toHaveBeenCalledTimes(3);
    });

    it('retries a confirmed serialization failure (P2010 / 40001) the same way as a deadlock', async () => {
      const serializationError = Object.assign(new Error('Raw query failed'), {
        code: 'P2010',
        meta: { code: '40001', message: 'ERROR: could not serialize access due to concurrent update' },
      });
      const transactionImpl = jest.fn().mockRejectedValueOnce(serializationError).mockResolvedValueOnce(successResult);
      const service = createRetryTestService(transactionImpl);

      const result = await service.apply(actor, dto);

      expect(result).toBe(successResult);
      expect(transactionImpl).toHaveBeenCalledTimes(2);
    });

    it('does not retry a P2010 raw-query error that is not a deadlock/serialization failure', async () => {
      const unrelatedRawQueryError = Object.assign(new Error('Raw query failed'), {
        code: 'P2010',
        meta: { code: '42601', message: 'ERROR: syntax error at or near "SELCT"' },
      });
      const transactionImpl = jest.fn().mockRejectedValue(unrelatedRawQueryError);
      const service = createRetryTestService(transactionImpl);

      await expect(service.apply(actor, dto)).rejects.toBe(unrelatedRawQueryError);
      expect(transactionImpl).toHaveBeenCalledTimes(1);
    });

    it('does not retry a business exception such as insufficient stock', async () => {
      const insufficientStock = new ConflictException('Insufficient stock');
      const transactionImpl = jest.fn().mockRejectedValue(insufficientStock);
      const service = createRetryTestService(transactionImpl);

      await expect(service.apply(actor, dto)).rejects.toBe(insufficientStock);
      expect(transactionImpl).toHaveBeenCalledTimes(1);
    });

    it('does not retry a validation/not-found error', async () => {
      const notFound = new NotFoundException('Product not found');
      const transactionImpl = jest.fn().mockRejectedValue(notFound);
      const service = createRetryTestService(transactionImpl);

      await expect(service.apply(actor, dto)).rejects.toBe(notFound);
      expect(transactionImpl).toHaveBeenCalledTimes(1);
    });

    it('on retry exhaustion, throws a clearly classified ConflictException — never a raw Prisma error', async () => {
      const transactionImpl = jest.fn().mockRejectedValue(deadlockError());
      const service = createRetryTestService(transactionImpl);

      let caught: unknown;
      try {
        await service.apply(actor, dto);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ConflictException);
      expect((caught as ConflictException).getResponse()).toMatchObject({
        code: 'UNBUILD_POSTING_DEADLOCK_EXHAUSTED',
      });
      // Exactly MAX_DEADLOCK_ATTEMPTS (3) attempts — bounded, not unbounded.
      expect(transactionImpl).toHaveBeenCalledTimes(3);
    });
  });
});
