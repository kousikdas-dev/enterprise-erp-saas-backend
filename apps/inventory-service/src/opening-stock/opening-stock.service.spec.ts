import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  OpeningStockStatus,
  Prisma,
  StockMovementType,
} from '../../generated/prisma-client';
import { OpeningStockService } from './opening-stock.service';

describe('OpeningStockService', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const actor = { userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', tenantId };
  const productId = 'p0000000-0000-4000-8000-000000000001';
  const product2Id = 'p0000000-0000-4000-8000-000000000002';
  const warehouseId = 'w0000000-0000-4000-8000-000000000001';
  const warehouse2Id = 'w0000000-0000-4000-8000-000000000002';
  const uomId = 'u0000000-0000-4000-8000-000000000001';
  const boxUomId = 'u0000000-0000-4000-8000-000000000002';
  const openingStockId = 'os000000-0000-4000-8000-000000000001';

  function decimal(v: string) {
    return new Prisma.Decimal(v);
  }

  function buildService(overrides?: { prisma?: object; audit?: object }) {
    return new OpeningStockService(
      (overrides?.prisma ?? {}) as never,
      (overrides?.audit ?? { record: jest.fn() }) as never,
    );
  }

  describe('resolveLine() via create() — UOM validation', () => {
    function basePrisma(overrides?: { product?: object; unit?: object; productUnit?: object | null }) {
      const tx = {
        openingStock: {
          count: jest.fn().mockResolvedValue(0),
          create: jest.fn().mockResolvedValue({
            id: openingStockId,
            tenantId,
            documentNumber: 'OB-00000001',
            status: OpeningStockStatus.DRAFT,
            effectiveDate: new Date(),
            postedAt: null,
            postedBy: null,
            reversedAt: null,
            reversedBy: null,
            reversalReason: null,
            notes: null,
            createdBy: actor.userId,
            createdAt: new Date(),
            updatedAt: new Date(),
            lines: [],
          }),
        },
      };
      return {
        product: {
          findFirst: jest.fn().mockResolvedValue(
            overrides?.product ?? { id: productId, unitOfMeasureId: uomId },
          ),
        },
        warehouse: { findFirst: jest.fn().mockResolvedValue({ id: warehouseId }) },
        unitOfMeasure: {
          findFirst: jest.fn().mockResolvedValue(
            overrides?.unit === undefined ? { id: uomId, code: 'PCS', name: 'Piece' } : overrides.unit,
          ),
        },
        productUnit: {
          findFirst: jest.fn().mockResolvedValue(
            overrides?.productUnit === undefined
              ? { conversionFactor: decimal('24') }
              : overrides.productUnit,
          ),
        },
        $transaction: jest.fn(async (fn: (c: typeof tx) => Promise<unknown>) => fn(tx)),
      };
    }

    it('accepts the base UOM with conversionFactor = 1', async () => {
      const prisma = basePrisma();
      prisma.unitOfMeasure.findFirst.mockResolvedValue({ id: uomId, code: 'PCS', name: 'Piece' });
      const service = buildService({ prisma });

      await service.create(actor, {
        effectiveDate: '2026-01-01',
        lines: [{ productId, warehouseId, quantity: '10', unitOfMeasureId: uomId }],
      });

      const created = (prisma.$transaction as jest.Mock).mock.calls; // sanity: transaction ran
      expect(created.length).toBe(1);
    });

    it('accepts a configured alternate UOM and computes baseQuantity = quantity × conversionFactor', async () => {
      const prisma = basePrisma();
      let capturedData: unknown;
      const tx = {
        openingStock: {
          count: jest.fn().mockResolvedValue(0),
          create: jest.fn((args: { data: unknown }) => {
            capturedData = args.data;
            return Promise.resolve({ ...args.data, lines: [] });
          }),
        },
      };
      prisma.$transaction = jest.fn(async (fn: (c: typeof tx) => Promise<unknown>) => fn(tx));
      prisma.unitOfMeasure.findFirst.mockResolvedValue({ id: boxUomId, code: 'BOX', name: 'Box' });
      prisma.productUnit.findFirst.mockResolvedValue({ conversionFactor: decimal('24') });
      const service = buildService({ prisma });

      await service.create(actor, {
        effectiveDate: '2026-01-01',
        lines: [{ productId, warehouseId, quantity: '2', unitOfMeasureId: boxUomId }],
      });

      const lineData = (capturedData as { lines: { create: Array<Record<string, unknown>> } }).lines.create[0];
      expect((lineData.baseQuantity as Prisma.Decimal).toString()).toBe('48');
      expect((lineData.conversionFactor as Prisma.Decimal).toString()).toBe('24');
    });

    it('rejects a UOM that does not exist in this tenant', async () => {
      const prisma = basePrisma({ unit: null });
      const service = buildService({ prisma });

      const error: ConflictException = await service
        .create(actor, {
          effectiveDate: '2026-01-01',
          lines: [{ productId, warehouseId, quantity: '10', unitOfMeasureId: boxUomId }],
        })
        .catch((e: unknown) => e as ConflictException);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error.getResponse() as { code: string }).code).toBe('OPENING_UOM_NOT_FOUND');
    });

    it('rejects a UOM not configured for this product', async () => {
      const prisma = basePrisma({ productUnit: null });
      prisma.unitOfMeasure.findFirst.mockResolvedValue({ id: boxUomId, code: 'BOX', name: 'Box' });
      const service = buildService({ prisma });

      const error: ConflictException = await service
        .create(actor, {
          effectiveDate: '2026-01-01',
          lines: [{ productId, warehouseId, quantity: '10', unitOfMeasureId: boxUomId }],
        })
        .catch((e: unknown) => e as ConflictException);

      expect((error.getResponse() as { code: string }).code).toBe('OPENING_UOM_PRODUCT_MISMATCH');
    });

    it('rejects a UOM with a zero/negative conversion factor', async () => {
      const prisma = basePrisma({ productUnit: { conversionFactor: decimal('0') } });
      prisma.unitOfMeasure.findFirst.mockResolvedValue({ id: boxUomId, code: 'BOX', name: 'Box' });
      const service = buildService({ prisma });

      const error: ConflictException = await service
        .create(actor, {
          effectiveDate: '2026-01-01',
          lines: [{ productId, warehouseId, quantity: '10', unitOfMeasureId: boxUomId }],
        })
        .catch((e: unknown) => e as ConflictException);

      expect((error.getResponse() as { code: string }).code).toBe(
        'OPENING_UOM_INVALID_CONVERSION_FACTOR',
      );
    });

    it('rejects zero/negative quantity', async () => {
      const prisma = basePrisma();
      const service = buildService({ prisma });

      await expect(
        service.create(actor, {
          effectiveDate: '2026-01-01',
          lines: [{ productId, warehouseId, quantity: '0', unitOfMeasureId: uomId }],
        }),
      ).rejects.toThrow('Quantity must be a positive decimal');
    });
  });

  describe('post()', () => {
    function draftLine(overrides?: Partial<Record<string, unknown>>) {
      return {
        id: 'line-1',
        openingStockId,
        productId,
        warehouseId,
        quantity: decimal('100'),
        unitOfMeasureId: uomId,
        uomCode: 'PCS',
        uomName: 'Piece',
        conversionFactor: decimal('1'),
        baseQuantity: decimal('100'),
        stockMovementId: null,
        ...overrides,
      };
    }

    function buildTx(status: OpeningStockStatus, lines: Array<Record<string, unknown>>) {
      return {
        $queryRaw: jest.fn(),
        openingStockLine: {
          findMany: jest.fn().mockResolvedValue(lines),
          update: jest.fn().mockResolvedValue({}),
        },
        openingStockActiveLine: {
          create: jest.fn().mockResolvedValue({}),
          findFirst: jest.fn(),
          deleteMany: jest.fn(),
        },
        stockMovement: {
          create: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
          findFirst: jest.fn(),
        },
        stock: { update: jest.fn(), create: jest.fn() },
        openingStock: { update: jest.fn().mockResolvedValue({}), findFirst: jest.fn() },
        __status: status,
      };
    }

    function headerLockRow(status: OpeningStockStatus) {
      return [{ id: openingStockId, status }];
    }

    it('posts a single-line DRAFT document: creates OPENING movement, creates Stock, sets stockMovementId, flips to POSTED', async () => {
      const lines = [draftLine()];
      const tx = buildTx(OpeningStockStatus.DRAFT, lines);
      tx.$queryRaw
        .mockResolvedValueOnce(headerLockRow(OpeningStockStatus.DRAFT)) // lockHeader
        .mockResolvedValueOnce([]) // Stock lock — no existing row
        .mockResolvedValueOnce([{ id: 'marker-1' }]); // duplicate-active insert succeeds
      tx.stockMovement.create.mockResolvedValue({ id: 'mv-1', type: StockMovementType.OPENING });

      const prisma = {
        $transaction: jest.fn(async (fn: (c: typeof tx) => Promise<unknown>) => fn(tx)),
        openingStock: {
          findFirstOrThrow: jest.fn().mockResolvedValue({
            id: openingStockId,
            tenantId,
            documentNumber: 'OB-00000001',
            status: OpeningStockStatus.POSTED,
            effectiveDate: new Date(),
            postedAt: new Date(),
            postedBy: actor.userId,
            reversedAt: null,
            reversedBy: null,
            reversalReason: null,
            notes: null,
            createdBy: actor.userId,
            createdAt: new Date(),
            updatedAt: new Date(),
            lines,
          }),
        },
      };
      const audit = { record: jest.fn() };
      const service = buildService({ prisma, audit });

      const result = await service.post(actor, openingStockId);

      expect(tx.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: StockMovementType.OPENING,
            quantity: decimal('100'),
            referenceType: 'opening_stock',
            referenceId: openingStockId,
          }),
        }),
      );
      expect(tx.stock.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ quantity: decimal('100') }) }),
      );
      expect(tx.openingStock.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: OpeningStockStatus.POSTED }) }),
      );
      expect(result.status).toBe(OpeningStockStatus.POSTED);
      expect(result.code).toBeUndefined();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'opening_stock.posted' }),
      );
    });

    it('blocks posting when a line\'s product+warehouse already has non-zero stock (OPENING_BLOCKED_EXISTING_STOCK), no bypass', async () => {
      const lines = [draftLine()];
      const tx = buildTx(OpeningStockStatus.DRAFT, lines);
      tx.$queryRaw
        .mockResolvedValueOnce(headerLockRow(OpeningStockStatus.DRAFT))
        .mockResolvedValueOnce([{ id: 'stock-1', quantity: decimal('5') }]);

      const prisma = {
        $transaction: jest.fn(async (fn: (c: typeof tx) => Promise<unknown>) => fn(tx)),
      };
      const service = buildService({ prisma });

      const error: ConflictException = await service
        .post(actor, openingStockId)
        .catch((e: unknown) => e as ConflictException);

      expect(error).toBeInstanceOf(ConflictException);
      const response = error.getResponse() as { code: string; details: unknown };
      expect(response.code).toBe('OPENING_BLOCKED_EXISTING_STOCK');
      expect(response.details).toEqual([
        { productId, warehouseId, existingQuantity: '5.000000' },
      ]);
      expect(tx.stockMovement.create).not.toHaveBeenCalled();
      expect(tx.openingStockActiveLine.create).not.toHaveBeenCalled();
    });

    it('blocks posting when another active document already covers a line\'s product+warehouse (OPENING_DUPLICATE_ACTIVE), no bypass', async () => {
      const lines = [draftLine()];
      const tx = buildTx(OpeningStockStatus.DRAFT, lines);
      tx.$queryRaw
        .mockResolvedValueOnce(headerLockRow(OpeningStockStatus.DRAFT))
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]); // duplicate-active insert conflicts (0 rows returned)
      tx.openingStockActiveLine.findFirst.mockResolvedValue({ openingStockId: 'other-doc' });
      tx.openingStock.findFirst.mockResolvedValue({ documentNumber: 'OB-00000002' });

      const prisma = {
        $transaction: jest.fn(async (fn: (c: typeof tx) => Promise<unknown>) => fn(tx)),
      };
      const service = buildService({ prisma });

      const error: ConflictException = await service
        .post(actor, openingStockId)
        .catch((e: unknown) => e as ConflictException);

      const response = error.getResponse() as { code: string; details: unknown };
      expect(response.code).toBe('OPENING_DUPLICATE_ACTIVE');
      expect(response.details).toEqual([
        {
          productId,
          warehouseId,
          activeOpeningStockId: 'other-doc',
          activeOpeningStockDocumentNumber: 'OB-00000002',
        },
      ]);
      expect(tx.openingStock.findFirst).toHaveBeenCalledWith({
        where: { id: 'other-doc', tenantId: actor.tenantId },
        select: { documentNumber: true },
      });
      expect(tx.stockMovement.create).not.toHaveBeenCalled();
    });

    it('multi-line document: only one product+warehouse conflicting blocks the ENTIRE document (all-or-nothing)', async () => {
      const lines = [
        draftLine({ id: 'line-1', productId, warehouseId }),
        draftLine({ id: 'line-2', productId: product2Id, warehouseId: warehouse2Id }),
      ];
      const tx = buildTx(OpeningStockStatus.DRAFT, lines);
      // Sorted order: productId < product2Id lexicographically assumed by fixture naming.
      tx.$queryRaw
        .mockResolvedValueOnce(headerLockRow(OpeningStockStatus.DRAFT))
        .mockResolvedValueOnce([]) // line-1 pair: no existing stock
        .mockResolvedValueOnce([{ id: 'stock-2', quantity: decimal('3') }]); // line-2 pair: conflict

      const prisma = {
        $transaction: jest.fn(async (fn: (c: typeof tx) => Promise<unknown>) => fn(tx)),
      };
      const service = buildService({ prisma });

      const error: ConflictException = await service
        .post(actor, openingStockId)
        .catch((e: unknown) => e as ConflictException);

      const response = error.getResponse() as { code: string; details: Array<{ productId: string }> };
      expect(response.code).toBe('OPENING_BLOCKED_EXISTING_STOCK');
      expect(response.details).toHaveLength(1);
      expect(response.details[0].productId).toBe(product2Id);
      // Neither line was applied — all-or-nothing.
      expect(tx.stockMovement.create).not.toHaveBeenCalled();
    });

    it('rejects posting a document with no lines', async () => {
      const tx = buildTx(OpeningStockStatus.DRAFT, []);
      tx.$queryRaw.mockResolvedValueOnce(headerLockRow(OpeningStockStatus.DRAFT));
      const prisma = {
        $transaction: jest.fn(async (fn: (c: typeof tx) => Promise<unknown>) => fn(tx)),
      };
      const service = buildService({ prisma });

      await expect(service.post(actor, openingStockId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('concurrent post of the SAME document: the losing request returns 200-shaped OPENING_ALREADY_POSTED, performs no existing-stock/duplicate-active checks, and creates no movement', async () => {
      const lines = [draftLine()];
      // Simulates "Request B": by the time it acquires the header lock, the
      // document is already POSTED (Request A committed first).
      const tx = buildTx(OpeningStockStatus.POSTED, lines);
      tx.$queryRaw.mockResolvedValueOnce(headerLockRow(OpeningStockStatus.POSTED));

      const prisma = {
        $transaction: jest.fn(async (fn: (c: typeof tx) => Promise<unknown>) => fn(tx)),
        openingStock: {
          findFirstOrThrow: jest.fn().mockResolvedValue({
            id: openingStockId,
            tenantId,
            documentNumber: 'OB-00000001',
            status: OpeningStockStatus.POSTED,
            effectiveDate: new Date(),
            postedAt: new Date(),
            postedBy: actor.userId,
            reversedAt: null,
            reversedBy: null,
            reversalReason: null,
            notes: null,
            createdBy: actor.userId,
            createdAt: new Date(),
            updatedAt: new Date(),
            lines,
          }),
        },
      };
      const audit = { record: jest.fn() };
      const service = buildService({ prisma, audit });

      const result = await service.post(actor, openingStockId);

      expect(result.code).toBe('OPENING_ALREADY_POSTED');
      expect(result.status).toBe(OpeningStockStatus.POSTED);
      // Never reached the lines query, the Stock lock, existing-stock check,
      // or duplicate-active check — it returned immediately after the
      // header lock revealed POSTED.
      expect(tx.openingStockLine.findMany).not.toHaveBeenCalled();
      expect(tx.openingStockActiveLine.create).not.toHaveBeenCalled();
      expect(tx.stockMovement.create).not.toHaveBeenCalled();
      // No duplicate audit entry for an idempotent replay.
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('rejects posting an already-REVERSED document', async () => {
      const tx = buildTx(OpeningStockStatus.REVERSED, []);
      tx.$queryRaw.mockResolvedValueOnce(headerLockRow(OpeningStockStatus.REVERSED));
      const prisma = {
        $transaction: jest.fn(async (fn: (c: typeof tx) => Promise<unknown>) => fn(tx)),
      };
      const service = buildService({ prisma });

      const error: ConflictException = await service
        .post(actor, openingStockId)
        .catch((e: unknown) => e as ConflictException);
      expect((error.getResponse() as { code: string }).code).toBe('OPENING_ALREADY_REVERSED');
    });

    it('adds baseQuantity onto an existing zero-quantity Stock row rather than always creating one', async () => {
      const lines = [draftLine()];
      const tx = buildTx(OpeningStockStatus.DRAFT, lines);
      tx.$queryRaw
        .mockResolvedValueOnce(headerLockRow(OpeningStockStatus.DRAFT))
        .mockResolvedValueOnce([{ id: 'stock-existing', quantity: decimal('0') }])
        .mockResolvedValueOnce([{ id: 'marker-1' }]);
      tx.stockMovement.create.mockResolvedValue({ id: 'mv-1' });

      const prisma = {
        $transaction: jest.fn(async (fn: (c: typeof tx) => Promise<unknown>) => fn(tx)),
        openingStock: {
          findFirstOrThrow: jest.fn().mockResolvedValue({
            id: openingStockId, tenantId, documentNumber: 'OB-1', status: OpeningStockStatus.POSTED,
            effectiveDate: new Date(), postedAt: new Date(), postedBy: actor.userId,
            reversedAt: null, reversedBy: null, reversalReason: null, notes: null,
            createdBy: actor.userId, createdAt: new Date(), updatedAt: new Date(), lines,
          }),
        },
      };
      const service = buildService({ prisma, audit: { record: jest.fn() } });

      await service.post(actor, openingStockId);

      expect(tx.stock.update).toHaveBeenCalledWith({
        where: { id: 'stock-existing' },
        data: { quantity: decimal('100') },
      });
      expect(tx.stock.create).not.toHaveBeenCalled();
    });
  });

  describe('reverse()', () => {
    function postedLine(overrides?: Partial<Record<string, unknown>>) {
      return {
        id: 'line-1',
        openingStockId,
        productId,
        warehouseId,
        quantity: decimal('100'),
        unitOfMeasureId: uomId,
        uomCode: 'PCS',
        uomName: 'Piece',
        conversionFactor: decimal('1'),
        baseQuantity: decimal('100'),
        stockMovementId: 'mv-original',
        ...overrides,
      };
    }

    function buildTx(lines: Array<Record<string, unknown>>) {
      return {
        $queryRaw: jest.fn(),
        openingStockLine: { findMany: jest.fn().mockResolvedValue(lines) },
        stockMovement: {
          findMany: jest.fn(),
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'mv-reversal' }),
        },
        stock: { update: jest.fn() },
        openingStockActiveLine: { deleteMany: jest.fn() },
        openingStock: { update: jest.fn().mockResolvedValue({}) },
      };
    }

    function fullHeader(lines: Array<Record<string, unknown>>, status: OpeningStockStatus) {
      return {
        id: openingStockId, tenantId, documentNumber: 'OB-1', status,
        effectiveDate: new Date(), postedAt: new Date(), postedBy: actor.userId,
        reversedAt: status === OpeningStockStatus.REVERSED ? new Date() : null,
        reversedBy: status === OpeningStockStatus.REVERSED ? actor.userId : null,
        reversalReason: null, notes: null,
        createdBy: actor.userId, createdAt: new Date(), updatedAt: new Date(), lines,
      };
    }

    it('reverses immediately after posting (no subsequent activity): creates ADJUSTMENT_OUT, decrements Stock, deletes the active-line marker, flips to REVERSED', async () => {
      const lines = [postedLine()];
      const tx = buildTx(lines);
      const original = {
        id: 'mv-original',
        sequenceNumber: 5n,
        type: StockMovementType.OPENING,
        createdAt: new Date(),
      };
      tx.$queryRaw
        .mockResolvedValueOnce([{ id: openingStockId, status: OpeningStockStatus.POSTED }]) // lockHeader
        .mockResolvedValueOnce([{ id: 'stock-1', quantity: decimal('100') }]); // Stock lock
      tx.stockMovement.findMany.mockResolvedValue([original]);
      tx.stockMovement.findFirst.mockResolvedValue(null); // no subsequent activity

      const prisma = {
        $transaction: jest.fn(async (fn: (c: typeof tx) => Promise<unknown>) => fn(tx)),
        openingStock: {
          findFirstOrThrow: jest.fn().mockResolvedValue(fullHeader(lines, OpeningStockStatus.REVERSED)),
        },
      };
      const audit = { record: jest.fn() };
      const service = buildService({ prisma, audit });

      const result = await service.reverse(actor, openingStockId, {});

      expect(tx.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: StockMovementType.ADJUSTMENT_OUT,
            quantity: decimal('100'),
            reversesMovementId: 'mv-original',
            referenceType: 'opening_stock',
          }),
        }),
      );
      expect(tx.stock.update).toHaveBeenCalledWith({
        where: { id: 'stock-1' },
        data: { quantity: decimal('0') },
      });
      expect(tx.openingStockActiveLine.deleteMany).toHaveBeenCalledWith({
        where: { tenantId, productId, warehouseId },
      });
      expect(tx.openingStock.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: OpeningStockStatus.REVERSED }) }),
      );
      expect(result.status).toBe(OpeningStockStatus.REVERSED);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'opening_stock.reversed' }),
      );
    });

    it.each([
      ['Purchase', StockMovementType.PURCHASE],
      ['Sale', StockMovementType.SALE],
      ['Adjustment', StockMovementType.ADJUSTMENT_IN],
    ])(
      'blocks reversal when %s activity occurred after the OPENING movement (OPENING_REVERSAL_BLOCKED_SUBSEQUENT_ACTIVITY), no bypass',
      async (_label, subsequentType) => {
        const lines = [postedLine()];
        const tx = buildTx(lines);
        const original = { id: 'mv-original', sequenceNumber: 5n, type: StockMovementType.OPENING, createdAt: new Date() };
        const subsequent = {
          id: 'mv-subsequent',
          sequenceNumber: 9n,
          type: subsequentType,
          createdAt: new Date('2026-02-01'),
        };
        tx.$queryRaw
          .mockResolvedValueOnce([{ id: openingStockId, status: OpeningStockStatus.POSTED }])
          .mockResolvedValueOnce([{ id: 'stock-1', quantity: decimal('150') }]);
        tx.stockMovement.findMany.mockResolvedValue([original]);
        tx.stockMovement.findFirst.mockResolvedValue(subsequent);

        const prisma = {
          $transaction: jest.fn(async (fn: (c: typeof tx) => Promise<unknown>) => fn(tx)),
        };
        const service = buildService({ prisma });

        const error: ConflictException = await service
          .reverse(actor, openingStockId, {})
          .catch((e: unknown) => e as ConflictException);

        expect(error).toBeInstanceOf(ConflictException);
        const response = error.getResponse() as {
          code: string;
          details: Array<{ subsequentMovementId: string; subsequentMovementType: string }>;
        };
        expect(response.code).toBe('OPENING_REVERSAL_BLOCKED_SUBSEQUENT_ACTIVITY');
        expect(response.details[0].subsequentMovementId).toBe('mv-subsequent');
        expect(response.details[0].subsequentMovementType).toBe(subsequentType);
        expect(tx.stockMovement.create).not.toHaveBeenCalled();
        expect(tx.openingStock.update).not.toHaveBeenCalled();
      },
    );

    it('multi-line document: only one product/warehouse having subsequent activity blocks the ENTIRE reversal', async () => {
      const lines = [
        postedLine({ id: 'line-1', productId, warehouseId, stockMovementId: 'mv-original-1' }),
        postedLine({ id: 'line-2', productId: product2Id, warehouseId: warehouse2Id, stockMovementId: 'mv-original-2' }),
      ];
      const tx = buildTx(lines);
      const original1 = { id: 'mv-original-1', sequenceNumber: 5n, type: StockMovementType.OPENING, createdAt: new Date() };
      const original2 = { id: 'mv-original-2', sequenceNumber: 6n, type: StockMovementType.OPENING, createdAt: new Date() };
      const subsequent = { id: 'mv-subsequent', sequenceNumber: 20n, type: StockMovementType.SALE, createdAt: new Date() };
      tx.$queryRaw
        .mockResolvedValueOnce([{ id: openingStockId, status: OpeningStockStatus.POSTED }])
        .mockResolvedValueOnce([{ id: 'stock-1', quantity: decimal('100') }])
        .mockResolvedValueOnce([{ id: 'stock-2', quantity: decimal('50') }]);
      tx.stockMovement.findMany.mockResolvedValue([original1, original2]);
      tx.stockMovement.findFirst
        .mockResolvedValueOnce(null) // line-1: clean
        .mockResolvedValueOnce(subsequent); // line-2: blocked

      const prisma = { $transaction: jest.fn(async (fn: (c: typeof tx) => Promise<unknown>) => fn(tx)) };
      const service = buildService({ prisma });

      const error: ConflictException = await service
        .reverse(actor, openingStockId, {})
        .catch((e: unknown) => e as ConflictException);

      const response = error.getResponse() as { code: string; details: unknown[] };
      expect(response.code).toBe('OPENING_REVERSAL_BLOCKED_SUBSEQUENT_ACTIVITY');
      expect(response.details).toHaveLength(1);
      expect(tx.stockMovement.create).not.toHaveBeenCalled();
    });

    it('rejects reversing a DRAFT document (OPENING_NOT_POSTED)', async () => {
      const tx = buildTx([]);
      tx.$queryRaw.mockResolvedValueOnce([{ id: openingStockId, status: OpeningStockStatus.DRAFT }]);
      const prisma = { $transaction: jest.fn(async (fn: (c: typeof tx) => Promise<unknown>) => fn(tx)) };
      const service = buildService({ prisma });

      const error: ConflictException = await service
        .reverse(actor, openingStockId, {})
        .catch((e: unknown) => e as ConflictException);
      expect((error.getResponse() as { code: string }).code).toBe('OPENING_NOT_POSTED');
    });

    it('reversing an already-REVERSED document is idempotent: 200-shaped OPENING_ALREADY_REVERSED, no new movement', async () => {
      const lines = [postedLine()];
      const tx = buildTx(lines);
      tx.$queryRaw.mockResolvedValueOnce([{ id: openingStockId, status: OpeningStockStatus.REVERSED }]);

      const prisma = {
        $transaction: jest.fn(async (fn: (c: typeof tx) => Promise<unknown>) => fn(tx)),
        openingStock: {
          findFirstOrThrow: jest.fn().mockResolvedValue(fullHeader(lines, OpeningStockStatus.REVERSED)),
        },
      };
      const audit = { record: jest.fn() };
      const service = buildService({ prisma, audit });

      const result = await service.reverse(actor, openingStockId, {});

      expect(result.code).toBe('OPENING_ALREADY_REVERSED');
      expect(tx.openingStockLine.findMany).not.toHaveBeenCalled();
      expect(tx.stockMovement.create).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('the document not found raises NotFoundException', async () => {
      const tx = { $queryRaw: jest.fn().mockResolvedValueOnce([]) };
      const prisma = { $transaction: jest.fn(async (fn: (c: typeof tx) => Promise<unknown>) => fn(tx)) };
      const service = buildService({ prisma });

      await expect(service.reverse(actor, openingStockId, {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('DRAFT CRUD — tenant isolation and editability guards', () => {
    it('getById scopes to tenant and 404s for another tenant\'s document', async () => {
      const prisma = { openingStock: { findFirst: jest.fn().mockResolvedValue(null) } };
      const service = buildService({ prisma });

      await expect(service.getById(actor, openingStockId)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.openingStock.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: openingStockId, tenantId } }),
      );
    });

    it('rejects adding a line once the document is no longer DRAFT', async () => {
      const tx = { $queryRaw: jest.fn().mockResolvedValueOnce([{ id: openingStockId, status: OpeningStockStatus.POSTED }]) };
      const prisma = {
        product: { findFirst: jest.fn().mockResolvedValue({ id: productId, unitOfMeasureId: uomId }) },
        warehouse: { findFirst: jest.fn().mockResolvedValue({ id: warehouseId }) },
        unitOfMeasure: { findFirst: jest.fn().mockResolvedValue({ id: uomId, code: 'PCS', name: 'Piece' }) },
        $transaction: jest.fn(async (fn: (c: typeof tx) => Promise<unknown>) => fn(tx)),
      };
      const service = buildService({ prisma });

      await expect(
        service.addLine(actor, openingStockId, {
          productId,
          warehouseId,
          quantity: '10',
          unitOfMeasureId: uomId,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a duplicate product+warehouse line within the same document', async () => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValueOnce([{ id: openingStockId, status: OpeningStockStatus.DRAFT }]),
        openingStockLine: {
          findFirst: jest.fn().mockResolvedValue({ id: 'existing-line' }),
        },
      };
      const prisma = {
        product: { findFirst: jest.fn().mockResolvedValue({ id: productId, unitOfMeasureId: uomId }) },
        warehouse: { findFirst: jest.fn().mockResolvedValue({ id: warehouseId }) },
        unitOfMeasure: { findFirst: jest.fn().mockResolvedValue({ id: uomId, code: 'PCS', name: 'Piece' }) },
        $transaction: jest.fn(async (fn: (c: typeof tx) => Promise<unknown>) => fn(tx)),
      };
      const service = buildService({ prisma });

      await expect(
        service.addLine(actor, openingStockId, {
          productId,
          warehouseId,
          quantity: '10',
          unitOfMeasureId: uomId,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
