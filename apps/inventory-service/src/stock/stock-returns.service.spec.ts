import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, StockMovementType } from '../../generated/prisma-client';
import {
  CreateStockReturnDto,
  stockReturnPayloadHash,
} from './dto/stock-return.dto';
import { StockReturnsService } from './stock-returns.service';

describe('StockReturnsService', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const warehouseId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const productId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const productId2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const originalMovementId = '77777777-7777-4777-8777-777777777777';
  const originalMovementId2 = '88888888-8888-4888-8888-888888888888';
  const shipmentId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

  const dto: CreateStockReturnDto = {
    referenceType: 'sales_return',
    referenceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    warehouseId,
    originalReferenceType: 'shipment',
    originalReferenceId: shipmentId,
    lines: [{ productId, quantity: '4', originalMovementId }],
  };

  function decimal(v: string) {
    return new Prisma.Decimal(v);
  }

  function originalMovementRow(overrides: Record<string, unknown> = {}) {
    return {
      id: originalMovementId,
      productId,
      warehouseId,
      type: 'SALE',
      quantity: decimal('10'),
      returnedQuantity: decimal('0'),
      unitCost: decimal('12.0000'),
      referenceType: 'shipment',
      referenceId: shipmentId,
      ...overrides,
    };
  }

  const payloadHash = stockReturnPayloadHash({
    warehouseId,
    originalReferenceType: dto.originalReferenceType,
    originalReferenceId: dto.originalReferenceId,
    lines: [{ productId, quantity: '4.000000', originalMovementId }],
  });

  it('treats 4 and 4.000000 as the same payload hash', () => {
    expect(
      stockReturnPayloadHash({
        warehouseId,
        originalReferenceType: dto.originalReferenceType,
        originalReferenceId: dto.originalReferenceId,
        lines: [{ productId, quantity: '4', originalMovementId }],
      }),
    ).toBe(payloadHash);
  });

  /**
   * $queryRaw is called in a fixed sequence: [0] the idempotency INSERT,
   * then per line: [1] the original-movement lock, [2] the Stock lock.
   * `queryResponses` supplies each call's return value in that exact order.
   */
  function createService(opts: {
    queryResponses: unknown[][];
    stockUpdate?: Record<string, unknown>;
    movementCreate?: Record<string, unknown>;
  }) {
    let call = 0;
    const tx = {
      $queryRaw: jest.fn().mockImplementation(async () => {
        const response = opts.queryResponses[call] ?? [];
        call += 1;
        return response;
      }),
      stockMovement: {
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue(
          opts.movementCreate ?? {
            id: 'mmmmmmmm-mmmm-4mmm-8mmm-mmmmmmmmmmmm',
            tenantId: actor.tenantId,
            productId,
            warehouseId,
            type: StockMovementType.SALE_RETURN,
            quantity: decimal('4'),
            referenceType: 'sales_return',
            referenceId: dto.referenceId,
            originalMovementId,
            createdBy: actor.userId,
            createdAt: new Date(),
            unitCost: decimal('12'),
            totalCost: decimal('48'),
          },
        ),
        findMany: jest.fn(),
      },
      stock: {
        update: jest.fn().mockResolvedValue(
          opts.stockUpdate ?? {
            id: 'ssssssss-ssss-4sss-8sss-ssssssssssss',
            tenantId: actor.tenantId,
            productId,
            warehouseId,
            quantity: decimal('104'),
            totalValue: decimal('1048'),
          },
        ),
        create: jest.fn().mockResolvedValue({
          id: 'ssssssss-ssss-4sss-8sss-ssssssssssss',
          tenantId: actor.tenantId,
          productId,
          warehouseId,
          quantity: decimal('4'),
          totalValue: decimal('48'),
        }),
        findFirst: jest.fn(),
      },
      stockReceiptApplication: { findFirst: jest.fn() },
    };
    const prisma = {
      warehouse: { findFirst: jest.fn().mockResolvedValue({ id: warehouseId }) },
      product: { findFirst: jest.fn().mockResolvedValue({ id: productId }) },
      $transaction: jest.fn(
        async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
      ),
    };
    return { service: new StockReturnsService(prisma as never), tx, prisma };
  }

  it('applies a new return: SALE_RETURN movement at the ORIGINAL movement cost, Stock increases', async () => {
    const { service, tx } = createService({
      queryResponses: [
        [{ id: 'app-1' }],
        [originalMovementRow()],
        [{ id: 's1', quantity: decimal('100'), totalValue: decimal('1000') }],
      ],
    });

    const result = await service.apply(actor, dto);

    expect(result.created).toBe(true);
    expect(result.movements[0].type).toBe(StockMovementType.SALE_RETURN);
    expect(result.movements[0].originalMovementId).toBe(originalMovementId);
    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: StockMovementType.SALE_RETURN,
          originalMovementId,
        }),
      }),
    );
    const createData = (tx.stockMovement.create as jest.Mock).mock.calls[0][0].data;
    // Original unitCost (12), NOT the current stock average (1000/100 = 10).
    expect((createData.unitCost as Prisma.Decimal).toString()).toBe('12');
    expect((createData.totalCost as Prisma.Decimal).toString()).toBe('48'); // 4 x 12
    const stockUpdateData = (tx.stock.update as jest.Mock).mock.calls[0][0].data;
    expect((stockUpdateData.quantity as Prisma.Decimal).toString()).toBe('104');
    expect((stockUpdateData.totalValue as Prisma.Decimal).toString()).toBe('1048');
  });

  it('uses the ORIGINAL movement cost even when the current moving average has since shifted', async () => {
    // Current stock average is now 20/unit (2000/100) — far from the
    // original sale's 12/unit. The return must still cost at 12/unit.
    const { service, tx } = createService({
      queryResponses: [
        [{ id: 'app-1' }],
        [originalMovementRow({ unitCost: decimal('12') })],
        [{ id: 's1', quantity: decimal('100'), totalValue: decimal('2000') }],
      ],
    });

    await service.apply(actor, dto);

    const createData = (tx.stockMovement.create as jest.Mock).mock.calls[0][0].data;
    expect((createData.unitCost as Prisma.Decimal).toString()).toBe('12');
    expect((createData.totalCost as Prisma.Decimal).toString()).toBe('48');
  });

  it('updates the original movement\'s returnedQuantity under lock', async () => {
    const { service, tx } = createService({
      queryResponses: [
        [{ id: 'app-1' }],
        [originalMovementRow({ returnedQuantity: decimal('2') })],
        [{ id: 's1', quantity: decimal('100'), totalValue: decimal('1000') }],
      ],
    });

    await service.apply(actor, dto);

    expect(tx.stockMovement.update).toHaveBeenCalledWith({
      where: { id: originalMovementId },
      data: { returnedQuantity: decimal('6') }, // 2 already + 4 now
    });
  });

  it('allows an exact cumulative return equal to the original quantity', async () => {
    const { service } = createService({
      queryResponses: [
        [{ id: 'app-1' }],
        [originalMovementRow({ quantity: decimal('10'), returnedQuantity: decimal('6') })],
        [{ id: 's1', quantity: decimal('100'), totalValue: decimal('1000') }],
      ],
    });

    // 6 already returned + 4 now = 10 = exactly the original quantity.
    await expect(service.apply(actor, dto)).resolves.toBeDefined();
  });

  it('rejects a cumulative return exceeding the original quantity', async () => {
    const { service } = createService({
      queryResponses: [
        [{ id: 'app-1' }],
        [originalMovementRow({ quantity: decimal('10'), returnedQuantity: decimal('7') })],
      ],
    });

    // 7 already returned + 4 now = 11 > 10.
    await expect(service.apply(actor, dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects when the original movement is not found', async () => {
    const { service } = createService({
      queryResponses: [[{ id: 'app-1' }], []],
    });
    await expect(service.apply(actor, dto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects when the original movement is not a SALE (e.g. a PURCHASE receipt)', async () => {
    const { service } = createService({
      queryResponses: [[{ id: 'app-1' }], [originalMovementRow({ type: 'PURCHASE' })]],
    });
    await expect(service.apply(actor, dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects when the original movement is itself a SALE_RETURN', async () => {
    const { service } = createService({
      queryResponses: [
        [{ id: 'app-1' }],
        [originalMovementRow({ type: 'SALE_RETURN' })],
      ],
    });
    await expect(service.apply(actor, dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects when the original movement\'s product does not match the requested line', async () => {
    const { service } = createService({
      queryResponses: [
        [{ id: 'app-1' }],
        [originalMovementRow({ productId: productId2 })],
      ],
    });
    await expect(service.apply(actor, dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects when the return warehouse does not match the original movement\'s warehouse', async () => {
    const { service } = createService({
      queryResponses: [
        [{ id: 'app-1' }],
        [originalMovementRow({ warehouseId: 'zzzzzzzz-zzzz-4zzz-8zzz-zzzzzzzzzzzz' })],
      ],
    });
    await expect(service.apply(actor, dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects when originalReferenceType is supplied and does not match the original movement', async () => {
    const { service } = createService({
      queryResponses: [
        [{ id: 'app-1' }],
        [originalMovementRow({ referenceType: 'something_else' })],
      ],
    });
    await expect(service.apply(actor, dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects when originalReferenceId is supplied and does not match the original movement', async () => {
    const { service } = createService({
      queryResponses: [
        [{ id: 'app-1' }],
        [originalMovementRow({ referenceId: 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa' })],
      ],
    });
    await expect(service.apply(actor, dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('does not require originalReferenceType/Id to be validated when omitted from the DTO', async () => {
    const dtoWithoutOriginalRef: CreateStockReturnDto = {
      referenceType: 'sales_return',
      referenceId: dto.referenceId,
      warehouseId,
      lines: [{ productId, quantity: '4', originalMovementId }],
    };
    const { service } = createService({
      queryResponses: [
        [{ id: 'app-1' }],
        [originalMovementRow({ referenceType: 'shipment', referenceId: 'totally-different' })],
        [{ id: 's1', quantity: decimal('100'), totalValue: decimal('1000') }],
      ],
    });
    await expect(
      service.apply(actor, dtoWithoutOriginalRef),
    ).resolves.toBeDefined();
  });

  it('rejects when the original movement has no cost information (legacy null unitCost)', async () => {
    const { service } = createService({
      queryResponses: [[{ id: 'app-1' }], [originalMovementRow({ unitCost: null })]],
    });
    await expect(service.apply(actor, dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('creates a new Stock row when none exists yet (defensive — normally already exists)', async () => {
    const { service, tx } = createService({
      queryResponses: [[{ id: 'app-1' }], [originalMovementRow()], []],
    });
    await service.apply(actor, dto);
    expect(tx.stock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quantity: decimal('4'),
          totalValue: decimal('48'),
        }),
      }),
    );
  });

  it('processes a multi-line return independently per line, each against its own original movement', async () => {
    const multiDto: CreateStockReturnDto = {
      referenceType: 'sales_return',
      referenceId: dto.referenceId,
      warehouseId,
      lines: [
        { productId, quantity: '4', originalMovementId },
        { productId: productId2, quantity: '3', originalMovementId: originalMovementId2 },
      ],
    };
    const { service, tx } = createService({
      queryResponses: [
        [{ id: 'app-1' }],
        [originalMovementRow()],
        [{ id: 's1', quantity: decimal('100'), totalValue: decimal('1000') }],
        [
          originalMovementRow({
            id: originalMovementId2,
            productId: productId2,
            unitCost: decimal('5'),
          }),
        ],
        [{ id: 's2', quantity: decimal('50'), totalValue: decimal('500') }],
      ],
    });

    const result = await service.apply(actor, multiDto);

    expect(result.movements).toHaveLength(2);
    expect(tx.stockMovement.create).toHaveBeenCalledTimes(2);
    expect(tx.stockMovement.update).toHaveBeenCalledTimes(2);
  });

  it('replays an existing return without creating a duplicate movement or updating stock again', async () => {
    const { service, tx } = createService({ queryResponses: [[]] });
    tx.stockReceiptApplication.findFirst.mockResolvedValue({
      id: 'app-1',
      tenantId: actor.tenantId,
      referenceType: 'sales_return',
      referenceId: dto.referenceId,
      warehouseId,
      payloadHash,
    });
    tx.stockMovement.findMany.mockResolvedValue([
      {
        id: 'm1',
        tenantId: actor.tenantId,
        productId,
        warehouseId,
        type: StockMovementType.SALE_RETURN,
        quantity: decimal('4'),
        referenceType: 'sales_return',
        referenceId: dto.referenceId,
        originalMovementId,
        createdBy: actor.userId,
        createdAt: new Date(),
        unitCost: decimal('12'),
        totalCost: decimal('48'),
      },
    ]);
    tx.stock.findFirst.mockResolvedValue({
      id: 's1',
      tenantId: actor.tenantId,
      productId,
      warehouseId,
      quantity: decimal('104'),
      totalValue: decimal('1048'),
    });

    const result = await service.apply(actor, {
      ...dto,
      lines: [{ ...dto.lines[0], quantity: '4.000000' }],
    });

    expect(result.created).toBe(false);
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.stock.update).not.toHaveBeenCalled();
    expect(result.stocks[0].totalValue).toBe('1048.0000');
  });

  it('rejects a replay whose payload does not match the original call', async () => {
    const { service, tx } = createService({ queryResponses: [[]] });
    tx.stockReceiptApplication.findFirst.mockResolvedValue({
      id: 'app-1',
      tenantId: actor.tenantId,
      referenceType: 'sales_return',
      referenceId: dto.referenceId,
      warehouseId,
      payloadHash,
    });
    await expect(
      service.apply(actor, {
        ...dto,
        lines: [{ ...dto.lines[0], quantity: '5' }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects missing warehouse for tenant', async () => {
    const { service, prisma } = createService({
      queryResponses: [
        [{ id: 'app-1' }],
        [originalMovementRow()],
        [{ id: 's1', quantity: decimal('100'), totalValue: decimal('1000') }],
      ],
    });
    prisma.warehouse.findFirst.mockResolvedValue(null);
    await expect(service.apply(actor, dto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects missing product for tenant', async () => {
    const { service, prisma } = createService({
      queryResponses: [
        [{ id: 'app-1' }],
        [originalMovementRow()],
        [{ id: 's1', quantity: decimal('100'), totalValue: decimal('1000') }],
      ],
    });
    prisma.product.findFirst.mockResolvedValue(null);
    await expect(service.apply(actor, dto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
