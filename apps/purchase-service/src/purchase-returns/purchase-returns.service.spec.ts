import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  GoodsReceiptPostingStatus,
  GoodsReceiptStatus,
  Prisma,
  PurchaseInvoiceStatus,
  PurchaseReturnAllocationType,
  PurchaseReturnPostingStatus,
  PurchaseReturnStatus,
} from '../../generated/prisma-client';
import { AccountingJournalClient } from '../accounting/accounting-journal.client';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { InventoryStockClient } from '../inventory/inventory-stock.client';
import { PurchaseReturnsService } from './purchase-returns.service';

describe('PurchaseReturnsService', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const goodsReceiptId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const warehouseId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const grItemId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const productId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const movementId = '77777777-7777-4777-8777-777777777777';
  const purchaseReturnId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const returnItemId = '88888888-8888-4888-8888-888888888888';
  const invoiceId = '99999999-9999-4999-8999-999999999999';
  const invoiceItemId = 'a0000000-0000-4000-8000-000000000000';

  function decimal(v: string) {
    return new Prisma.Decimal(v);
  }

  function sqlText(args: unknown[]): string {
    const first = args[0] as { sql?: string } | string[];
    if (first && typeof first === 'object' && 'sql' in first && (first as { sql?: string }).sql) {
      return (first as { sql: string }).sql;
    }
    if (Array.isArray(first)) return first.join(' ');
    return String(first);
  }

  /** GoodsReceiptItem row shape, as loaded/locked during create()/confirm(). */
  function grItemRow(overrides: Record<string, unknown> = {}) {
    return {
      id: grItemId,
      goodsReceiptId,
      productId,
      productSku: 'SKU-1',
      productName: 'Widget',
      unitOfMeasureId: null,
      uomCode: null,
      uomName: null,
      conversionFactor: null,
      baseQuantity: decimal('100'),
      unitCost: decimal('10.0000'),
      unmatchedReturnedQuantity: decimal('0'),
      inventoryMovementId: movementId,
      ...overrides,
    };
  }

  /** A PurchaseReturnItem row, as loaded inside allocateAndConfirm(). */
  function returnItemRow(overrides: Record<string, unknown> = {}) {
    return {
      id: returnItemId,
      tenantId: actor.tenantId,
      purchaseReturnId,
      goodsReceiptItemId: grItemId,
      productId,
      productSku: 'SKU-1',
      productName: 'Widget',
      conversionFactor: null,
      quantity: decimal('70'),
      baseQuantity: decimal('70'),
      inventoryMovementId: null,
      ...overrides,
    };
  }

  /** A candidate PurchaseInvoiceItem slice, as returned by the soft (unlocked) read. */
  function sliceRow(overrides: Record<string, unknown> = {}) {
    return {
      id: invoiceItemId,
      goodsReceiptItemId: grItemId,
      purchaseInvoiceId: invoiceId,
      quantity: decimal('60'),
      conversionFactor: null,
      lineSubtotal: decimal('630.0000'),
      returnedQuantity: decimal('0'),
      purchaseInvoice: { confirmedAt: new Date('2026-09-20T00:00:00Z') },
      ...overrides,
    };
  }

  function buildConfirmTx(options: {
    purchaseReturnStatus?: string;
    grStatus?: string;
    grAccountingStatus?: string;
    purchaseReturnItems: Array<Record<string, unknown>>;
    grItemRows: Array<Record<string, unknown>>;
    matchRows?: Array<{ id: string; goodsReceiptItemId: string; matchedQuantity: Prisma.Decimal; returnedQuantity: Prisma.Decimal }>;
    candidateSlices?: Array<Record<string, unknown>>;
    lockedSliceRows?: Array<{ id: string; purchaseInvoiceId: string; returnedQuantity: Prisma.Decimal }>;
    invoiceStatuses?: Array<{ id: string; status: string }>;
    lockedMatchRows?: Array<{ id: string; goodsReceiptItemId: string; returnedQuantity: Prisma.Decimal }>;
    postedResult: Record<string, unknown>;
  }) {
    const allocationCreateCalls: Array<{ data: Record<string, unknown> }> = [];
    const goodsReceiptItemUpdateCalls: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
    const invoiceItemUpdateCalls: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
    const matchUpdateCalls: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
    const matchUpsertCalls: Array<{ where: { goodsReceiptItemId: string } }> = [];
    const purchaseReturnItemUpdateCalls: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];

    return {
      $queryRaw: jest.fn((...args: unknown[]) => {
        const sql = sqlText(args);
        if (sql.includes('FROM purchase_returns')) {
          return Promise.resolve([
            { id: purchaseReturnId, status: options.purchaseReturnStatus ?? PurchaseReturnStatus.DRAFT },
          ]);
        }
        if (sql.includes('FROM goods_receipts')) {
          return Promise.resolve([
            {
              id: goodsReceiptId,
              status: options.grStatus ?? GoodsReceiptStatus.POSTED,
              accountingPostingStatus: options.grAccountingStatus ?? GoodsReceiptPostingStatus.POSTED,
            },
          ]);
        }
        if (sql.includes('FROM goods_receipt_items')) {
          return Promise.resolve(options.grItemRows);
        }
        if (sql.includes('FROM purchase_invoice_items')) {
          return Promise.resolve(options.lockedSliceRows ?? []);
        }
        if (sql.includes('FROM purchase_invoice_goods_receipt_matches')) {
          return Promise.resolve(options.lockedMatchRows ?? []);
        }
        throw new Error(`Unexpected $queryRaw call: ${sql}`);
      }),
      purchaseReturn: {
        findFirstOrThrow: jest.fn().mockResolvedValue({
          id: purchaseReturnId,
          goodsReceiptId,
          items: options.purchaseReturnItems,
        }),
        update: jest.fn().mockResolvedValue(options.postedResult),
      },
      purchaseInvoiceGoodsReceiptMatch: {
        findMany: jest.fn().mockResolvedValue(options.matchRows ?? []),
        upsert: jest.fn((args: { where: { goodsReceiptItemId: string } }) => {
          matchUpsertCalls.push(args);
          return Promise.resolve({});
        }),
        update: jest.fn((args: { where: { id: string }; data: Record<string, unknown> }) => {
          matchUpdateCalls.push(args);
          return Promise.resolve({});
        }),
      },
      purchaseInvoiceItem: {
        findMany: jest.fn().mockResolvedValue(options.candidateSlices ?? []),
        update: jest.fn((args: { where: { id: string }; data: Record<string, unknown> }) => {
          invoiceItemUpdateCalls.push(args);
          return Promise.resolve({});
        }),
      },
      purchaseInvoice: {
        findMany: jest.fn().mockResolvedValue(options.invoiceStatuses ?? []),
      },
      goodsReceiptItem: {
        update: jest.fn((args: { where: { id: string }; data: Record<string, unknown> }) => {
          goodsReceiptItemUpdateCalls.push(args);
          return Promise.resolve({});
        }),
      },
      purchaseReturnItemAllocation: {
        create: jest.fn((args: { data: Record<string, unknown> }) => {
          allocationCreateCalls.push(args);
          return Promise.resolve({});
        }),
      },
      purchaseReturnItem: {
        update: jest.fn((args: { where: { id: string }; data: Record<string, unknown> }) => {
          purchaseReturnItemUpdateCalls.push(args);
          return Promise.resolve({});
        }),
      },
      __allocationCreateCalls: allocationCreateCalls,
      __goodsReceiptItemUpdateCalls: goodsReceiptItemUpdateCalls,
      __invoiceItemUpdateCalls: invoiceItemUpdateCalls,
      __matchUpdateCalls: matchUpdateCalls,
      __matchUpsertCalls: matchUpsertCalls,
      __purchaseReturnItemUpdateCalls: purchaseReturnItemUpdateCalls,
    };
  }

  /** tx mock for restoreAndReverse(), mirroring buildConfirmTx()'s own shape. */
  function buildReverseTx(options: {
    purchaseReturnStatus?: string;
    purchaseReturnItems: Array<Record<string, unknown>>;
    grItemRows?: Array<{ id: string; unmatchedReturnedQuantity: Prisma.Decimal }>;
    sliceRows?: Array<{ id: string; purchaseInvoiceId: string; returnedQuantity: Prisma.Decimal }>;
    invoiceStatuses?: Array<{ id: string; status: string }>;
    matchRows?: Array<{ id: string; goodsReceiptItemId: string; returnedQuantity: Prisma.Decimal }>;
    postedResult: Record<string, unknown>;
  }) {
    const goodsReceiptItemUpdateCalls: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
    const invoiceItemUpdateCalls: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
    const matchUpdateCalls: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
    const purchaseReturnUpdateCalls: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];

    return {
      $queryRaw: jest.fn((...args: unknown[]) => {
        const sql = sqlText(args);
        if (sql.includes('FROM purchase_returns')) {
          return Promise.resolve([
            { id: purchaseReturnId, status: options.purchaseReturnStatus ?? PurchaseReturnStatus.CONFIRMED },
          ]);
        }
        if (sql.includes('FROM goods_receipt_items')) {
          return Promise.resolve(options.grItemRows ?? []);
        }
        if (sql.includes('FROM purchase_invoice_items')) {
          return Promise.resolve(options.sliceRows ?? []);
        }
        if (sql.includes('FROM purchase_invoice_goods_receipt_matches')) {
          return Promise.resolve(options.matchRows ?? []);
        }
        throw new Error(`Unexpected $queryRaw call: ${sql}`);
      }),
      purchaseReturn: {
        findFirstOrThrow: jest.fn().mockResolvedValue({
          id: purchaseReturnId,
          items: options.purchaseReturnItems,
        }),
        update: jest.fn((args: { where: { id: string }; data: Record<string, unknown> }) => {
          purchaseReturnUpdateCalls.push(args);
          return Promise.resolve(options.postedResult);
        }),
      },
      purchaseInvoice: {
        findMany: jest.fn().mockResolvedValue(options.invoiceStatuses ?? []),
      },
      goodsReceiptItem: {
        update: jest.fn((args: { where: { id: string }; data: Record<string, unknown> }) => {
          goodsReceiptItemUpdateCalls.push(args);
          return Promise.resolve({});
        }),
      },
      purchaseInvoiceItem: {
        update: jest.fn((args: { where: { id: string }; data: Record<string, unknown> }) => {
          invoiceItemUpdateCalls.push(args);
          return Promise.resolve({});
        }),
      },
      purchaseInvoiceGoodsReceiptMatch: {
        update: jest.fn((args: { where: { id: string }; data: Record<string, unknown> }) => {
          matchUpdateCalls.push(args);
          return Promise.resolve({});
        }),
      },
      __goodsReceiptItemUpdateCalls: goodsReceiptItemUpdateCalls,
      __invoiceItemUpdateCalls: invoiceItemUpdateCalls,
      __matchUpdateCalls: matchUpdateCalls,
      __purchaseReturnUpdateCalls: purchaseReturnUpdateCalls,
    };
  }

  function buildReturnRow(overrides: Record<string, unknown> = {}) {
    return {
      id: purchaseReturnId,
      tenantId: actor.tenantId,
      returnNumber: 'PRET-00000001',
      goodsReceiptId,
      warehouseId,
      status: PurchaseReturnStatus.DRAFT,
      reason: null,
      returnedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      accountingPostingStatus: PurchaseReturnPostingStatus.NOT_POSTED,
      journalEntryId: null,
      items: [
        {
          ...returnItemRow(),
          goodsReceiptItem: { inventoryMovementId: movementId },
          allocations: [],
        },
      ],
      ...overrides,
    };
  }

  function buildService(options: {
    findFirstReturn?: jest.Mock;
    findFirstGoodsReceipt?: jest.Mock;
    confirmTx?: ReturnType<typeof buildConfirmTx>;
    reverseTx?: ReturnType<typeof buildReverseTx>;
    applyReturn?: jest.Mock;
    postJournal?: jest.Mock;
    reverseJournal?: jest.Mock;
    createReturn?: jest.Mock;
    countReturn?: jest.Mock;
    updateReturn?: jest.Mock;
  } = {}) {
    const prisma = {
      purchaseReturn: {
        findFirst: options.findFirstReturn ?? jest.fn().mockResolvedValue(buildReturnRow()),
        findMany: jest.fn().mockResolvedValue([]),
        count: options.countReturn ?? jest.fn().mockResolvedValue(0),
        create: options.createReturn,
        update: options.updateReturn ?? jest.fn().mockResolvedValue(buildReturnRow({ status: PurchaseReturnStatus.CONFIRMED })),
      },
      goodsReceipt: {
        findFirst:
          options.findFirstGoodsReceipt ??
          jest.fn().mockResolvedValue({
            id: goodsReceiptId,
            warehouseId,
            status: GoodsReceiptStatus.POSTED,
            accountingPostingStatus: GoodsReceiptPostingStatus.POSTED,
            items: [grItemRow()],
          }),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = options.reverseTx ?? options.confirmTx;
        if (!tx) throw new Error('No confirmTx/reverseTx configured');
        return fn(tx);
      }),
    };
    const inventory = {
      // Default: one movement per line sent, matching the real service's own
      // contract (movements[] is always the same length as lines[], in
      // request order) — needed so zipMovementIds() doesn't reject tests that
      // don't care about the resulting movement id.
      applyReturn:
        options.applyReturn ??
        jest.fn((_actor: unknown, body: { lines: Array<{ productId: string }> }) =>
          Promise.resolve({
            created: true,
            movements: body.lines.map((line) => ({
              id: movementId,
              productId: line.productId,
              unitCost: null,
              totalCost: null,
            })),
          }),
        ),
    };
    const accountingJournal = {
      post:
        options.postJournal ??
        jest.fn().mockResolvedValue({ id: 'je-1', idempotentReplay: false }),
      reverse:
        options.reverseJournal ??
        jest.fn().mockResolvedValue({ id: 'je-rev-1', idempotentReplay: false }),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new PurchaseReturnsService(
      prisma as never,
      inventory as unknown as InventoryStockClient,
      accountingJournal as unknown as AccountingJournalClient,
      audit as unknown as IdentityAuditClient,
    );
    return { service, prisma, inventory, accountingJournal, audit };
  }

  // ============================== CREATE ===================================

  describe('create()', () => {
    it('creates a DRAFT purchase return with baseQuantity derived from the GR item conversionFactor', async () => {
      const createReturn = jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve(
          buildReturnRow({
            id: 'created',
            items: (args.data as { items: { create: Array<Record<string, unknown>> } }).items.create.map(
              (item) => ({ ...item, id: 'item-1', goodsReceiptItem: { inventoryMovementId: movementId }, allocations: [] }),
            ),
          }),
        ),
      );
      const { service } = buildService({ createReturn });

      const result = await service.create(actor, {
        goodsReceiptId,
        items: [{ goodsReceiptItemId: grItemId, quantity: '70' }],
      });

      expect(result.items[0].baseQuantity).toBe('70.000000');
      expect(result.items[0].quantity).toBe('70.000000');
    });

    it('rejects when the goods receipt is not found', async () => {
      const { service } = buildService({ findFirstGoodsReceipt: jest.fn().mockResolvedValue(null) });
      await expect(
        service.create(actor, { goodsReceiptId, items: [{ goodsReceiptItemId: grItemId, quantity: '1' }] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects when the goods receipt has not been posted to accounting yet', async () => {
      const { service } = buildService({
        findFirstGoodsReceipt: jest.fn().mockResolvedValue({
          id: goodsReceiptId,
          warehouseId,
          status: GoodsReceiptStatus.POSTED,
          accountingPostingStatus: GoodsReceiptPostingStatus.NOT_POSTED,
          items: [grItemRow()],
        }),
      });
      await expect(
        service.create(actor, { goodsReceiptId, items: [{ goodsReceiptItemId: grItemId, quantity: '1' }] }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects when the goods receipt item does not belong to the specified receipt', async () => {
      const { service } = buildService();
      await expect(
        service.create(actor, {
          goodsReceiptId,
          items: [{ goodsReceiptItemId: 'nonexistent-item', quantity: '1' }],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a legacy goods receipt item with no captured inventory movement reference', async () => {
      const { service } = buildService({
        findFirstGoodsReceipt: jest.fn().mockResolvedValue({
          id: goodsReceiptId,
          warehouseId,
          status: GoodsReceiptStatus.POSTED,
          accountingPostingStatus: GoodsReceiptPostingStatus.POSTED,
          items: [grItemRow({ inventoryMovementId: null })],
        }),
      });
      await expect(
        service.create(actor, { goodsReceiptId, items: [{ goodsReceiptItemId: grItemId, quantity: '1' }] }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects duplicate goodsReceiptItemId values within one request', async () => {
      const { service } = buildService();
      await expect(
        service.create(actor, {
          goodsReceiptId,
          items: [
            { goodsReceiptItemId: grItemId, quantity: '1' },
            { goodsReceiptItemId: grItemId, quantity: '2' },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ============================== CONFIRM ===================================

  describe('confirm() — allocation algorithm', () => {
    it('is idempotent: confirming an already-CONFIRMED return returns it without calling Inventory again', async () => {
      const findFirstReturn = jest
        .fn()
        .mockResolvedValue(buildReturnRow({ status: PurchaseReturnStatus.CONFIRMED }));
      const applyReturn = jest.fn();
      const { service } = buildService({ findFirstReturn, applyReturn });

      const result = await service.confirm(actor, purchaseReturnId);

      expect(result.status).toBe('CONFIRMED');
      expect(applyReturn).not.toHaveBeenCalled();
    });

    it('calls Inventory with originalMovementId sourced from GoodsReceiptItem.inventoryMovementId', async () => {
      const findFirstReturn = jest.fn().mockResolvedValue(
        buildReturnRow({
          items: [
            {
              ...returnItemRow({ baseQuantity: decimal('10') }),
              goodsReceiptItem: { inventoryMovementId: movementId },
              allocations: [],
            },
          ],
        }),
      );
      const confirmTx = buildConfirmTx({
        purchaseReturnItems: [returnItemRow({ baseQuantity: decimal('10') })],
        grItemRows: [grItemRow()],
        postedResult: buildReturnRow({ status: PurchaseReturnStatus.CONFIRMED }),
      });
      const applyReturn = jest.fn().mockResolvedValue({
        created: true,
        movements: [{ id: movementId, productId, unitCost: null, totalCost: null }],
      });
      const { service } = buildService({ confirmTx, applyReturn, findFirstReturn });

      await service.confirm(actor, purchaseReturnId);

      expect(applyReturn).toHaveBeenCalledWith(actor, {
        referenceType: 'purchase_return',
        referenceId: purchaseReturnId,
        warehouseId,
        lines: [{ productId, quantity: '10.000000', originalMovementId: movementId }],
      });
    });

    it('rejects when a line has no captured inventory movement reference', async () => {
      const findFirstReturn = jest.fn().mockResolvedValue(
        buildReturnRow({ items: [{ ...returnItemRow(), goodsReceiptItem: { inventoryMovementId: null }, allocations: [] }] }),
      );
      const { service } = buildService({ findFirstReturn });
      await expect(service.confirm(actor, purchaseReturnId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects when the goods receipt is no longer posted/accounted (soft check before the external call)', async () => {
      const { service } = buildService({
        findFirstGoodsReceipt: jest.fn().mockResolvedValue({
          id: goodsReceiptId,
          status: GoodsReceiptStatus.POSTED,
          accountingPostingStatus: GoodsReceiptPostingStatus.FAILED,
        }),
      });
      await expect(service.confirm(actor, purchaseReturnId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('UNMATCHED-ONLY: fully satisfied from the never-invoiced bucket, match table never touched', async () => {
      const confirmTx = buildConfirmTx({
        purchaseReturnItems: [returnItemRow({ baseQuantity: decimal('40') })],
        grItemRows: [grItemRow({ unmatchedReturnedQuantity: decimal('0') })],
        matchRows: [], // no invoice has ever matched this line
        postedResult: buildReturnRow({ status: PurchaseReturnStatus.CONFIRMED }),
      });
      const { service } = buildService({ confirmTx });

      await service.confirm(actor, purchaseReturnId);

      expect(confirmTx.__allocationCreateCalls).toHaveLength(1);
      const alloc = confirmTx.__allocationCreateCalls[0].data;
      expect(alloc.allocationType).toBe(PurchaseReturnAllocationType.UNMATCHED_RECEIPT);
      expect((alloc.baseQuantity as Prisma.Decimal).toString()).toBe('40');
      expect((alloc.receiptCostAmount as Prisma.Decimal).toString()).toBe('400');
      expect(confirmTx.__goodsReceiptItemUpdateCalls).toHaveLength(1);
      expect(
        (confirmTx.__goodsReceiptItemUpdateCalls[0].data.unmatchedReturnedQuantity as Prisma.Decimal).toString(),
      ).toBe('40');
      // Never touches the invoice-matching machinery at all.
      expect(confirmTx.__invoiceItemUpdateCalls).toHaveLength(0);
      expect(confirmTx.__matchUpsertCalls).toHaveLength(0);
      expect(confirmTx.__matchUpdateCalls).toHaveLength(0);
    });

    it('MATCHED-ONLY: fully invoiced line, matchedQuantity untouched, returnedQuantity incremented on both the slice and the match row', async () => {
      const confirmTx = buildConfirmTx({
        purchaseReturnItems: [returnItemRow({ baseQuantity: decimal('30') })],
        grItemRows: [grItemRow({ baseQuantity: decimal('60'), unmatchedReturnedQuantity: decimal('0') })],
        matchRows: [{ id: 'match-1', goodsReceiptItemId: grItemId, matchedQuantity: decimal('60'), returnedQuantity: decimal('0') }],
        candidateSlices: [sliceRow({ quantity: decimal('60'), lineSubtotal: decimal('630.0000') })],
        lockedSliceRows: [{ id: invoiceItemId, purchaseInvoiceId: invoiceId, returnedQuantity: decimal('0') }],
        invoiceStatuses: [{ id: invoiceId, status: PurchaseInvoiceStatus.CONFIRMED }],
        lockedMatchRows: [{ id: 'match-1', goodsReceiptItemId: grItemId, returnedQuantity: decimal('0') }],
        postedResult: buildReturnRow({ status: PurchaseReturnStatus.CONFIRMED }),
      });
      const { service } = buildService({ confirmTx });

      await service.confirm(actor, purchaseReturnId);

      expect(confirmTx.__allocationCreateCalls).toHaveLength(1);
      const alloc = confirmTx.__allocationCreateCalls[0].data;
      expect(alloc.allocationType).toBe(PurchaseReturnAllocationType.MATCHED_INVOICE);
      expect(alloc.purchaseInvoiceItemId).toBe(invoiceItemId);
      expect((alloc.baseQuantity as Prisma.Decimal).toString()).toBe('30');
      expect((alloc.receiptCostAmount as Prisma.Decimal).toString()).toBe('300');
      expect((alloc.invoiceUnitCost as Prisma.Decimal).toString()).toBe('10.5');
      expect((alloc.invoiceCostAmount as Prisma.Decimal).toString()).toBe('315');
      expect((alloc.ppvAmount as Prisma.Decimal).toString()).toBe('15');

      // matchedQuantity is NEVER decremented by a return — only invoice cancel does that.
      expect(confirmTx.__matchUpdateCalls).toHaveLength(1);
      expect(confirmTx.__matchUpdateCalls[0].data).toEqual({ returnedQuantity: decimal('30') });
      expect(confirmTx.__invoiceItemUpdateCalls).toHaveLength(1);
      expect((confirmTx.__invoiceItemUpdateCalls[0].data.returnedQuantity as Prisma.Decimal).toString()).toBe('30');
      // Unmatched bucket untouched.
      expect(confirmTx.__goodsReceiptItemUpdateCalls).toHaveLength(0);
    });

    it('SPLIT (worked example): 70-unit return against a 100-unit line with 60 already matched — 40 unmatched @ receipt cost + 30 matched @ invoice cost, PPV = +15', async () => {
      const confirmTx = buildConfirmTx({
        purchaseReturnItems: [returnItemRow({ baseQuantity: decimal('70') })],
        grItemRows: [grItemRow({ baseQuantity: decimal('100'), unitCost: decimal('10.0000'), unmatchedReturnedQuantity: decimal('0') })],
        matchRows: [{ id: 'match-1', goodsReceiptItemId: grItemId, matchedQuantity: decimal('60'), returnedQuantity: decimal('0') }],
        candidateSlices: [sliceRow({ quantity: decimal('60'), lineSubtotal: decimal('630.0000') })],
        lockedSliceRows: [{ id: invoiceItemId, purchaseInvoiceId: invoiceId, returnedQuantity: decimal('0') }],
        invoiceStatuses: [{ id: invoiceId, status: PurchaseInvoiceStatus.CONFIRMED }],
        lockedMatchRows: [{ id: 'match-1', goodsReceiptItemId: grItemId, returnedQuantity: decimal('0') }],
        postedResult: buildReturnRow({ status: PurchaseReturnStatus.CONFIRMED }),
      });
      const { service } = buildService({ confirmTx });

      await service.confirm(actor, purchaseReturnId);

      expect(confirmTx.__allocationCreateCalls).toHaveLength(2);
      const unmatched = confirmTx.__allocationCreateCalls.find(
        (c) => c.data.allocationType === PurchaseReturnAllocationType.UNMATCHED_RECEIPT,
      )!.data;
      const matched = confirmTx.__allocationCreateCalls.find(
        (c) => c.data.allocationType === PurchaseReturnAllocationType.MATCHED_INVOICE,
      )!.data;

      expect((unmatched.baseQuantity as Prisma.Decimal).toString()).toBe('40');
      expect((unmatched.receiptCostAmount as Prisma.Decimal).toString()).toBe('400');

      expect((matched.baseQuantity as Prisma.Decimal).toString()).toBe('30');
      expect((matched.receiptCostAmount as Prisma.Decimal).toString()).toBe('300');
      expect((matched.invoiceCostAmount as Prisma.Decimal).toString()).toBe('315');
      expect((matched.ppvAmount as Prisma.Decimal).toString()).toBe('15');

      expect(
        (confirmTx.__goodsReceiptItemUpdateCalls[0].data.unmatchedReturnedQuantity as Prisma.Decimal).toString(),
      ).toBe('40');
      // matchedQuantity absent from the update payload entirely — only returnedQuantity is ever written.
      expect(confirmTx.__matchUpdateCalls[0].data).toEqual({ returnedQuantity: decimal('30') });
    });

    it('MULTIPLE OLDEST-FIRST SLICES: consumes the earlier-confirmed invoice slice fully before touching a later one', async () => {
      const invoiceItemIdA = 'a1111111-1111-4111-8111-111111111111';
      const invoiceIdA = 'a2222222-2222-4222-8222-222222222222';
      const invoiceItemIdB = 'a3333333-3333-4333-8333-333333333333';
      const invoiceIdB = 'a4444444-4444-4444-8444-444444444444';

      const confirmTx = buildConfirmTx({
        purchaseReturnItems: [returnItemRow({ baseQuantity: decimal('50') })],
        grItemRows: [grItemRow({ baseQuantity: decimal('100'), unmatchedReturnedQuantity: decimal('0') })],
        matchRows: [{ id: 'match-1', goodsReceiptItemId: grItemId, matchedQuantity: decimal('80'), returnedQuantity: decimal('0') }],
        candidateSlices: [
          sliceRow({
            id: invoiceItemIdA,
            purchaseInvoiceId: invoiceIdA,
            quantity: decimal('40'),
            lineSubtotal: decimal('400.0000'),
            purchaseInvoice: { confirmedAt: new Date('2026-09-10T00:00:00Z') }, // OLDER
          }),
          sliceRow({
            id: invoiceItemIdB,
            purchaseInvoiceId: invoiceIdB,
            quantity: decimal('40'),
            lineSubtotal: decimal('440.0000'),
            purchaseInvoice: { confirmedAt: new Date('2026-09-20T00:00:00Z') }, // NEWER
          }),
        ],
        lockedSliceRows: [
          { id: invoiceItemIdA, purchaseInvoiceId: invoiceIdA, returnedQuantity: decimal('0') },
          { id: invoiceItemIdB, purchaseInvoiceId: invoiceIdB, returnedQuantity: decimal('0') },
        ],
        invoiceStatuses: [
          { id: invoiceIdA, status: PurchaseInvoiceStatus.CONFIRMED },
          { id: invoiceIdB, status: PurchaseInvoiceStatus.CONFIRMED },
        ],
        lockedMatchRows: [{ id: 'match-1', goodsReceiptItemId: grItemId, returnedQuantity: decimal('0') }],
        postedResult: buildReturnRow({ status: PurchaseReturnStatus.CONFIRMED }),
      });
      const { service } = buildService({ confirmTx });

      await service.confirm(actor, purchaseReturnId);

      // 20 unmatched (100 - 80) + 30 matched, entirely from slice A (40 capacity) — B untouched.
      expect(confirmTx.__invoiceItemUpdateCalls).toHaveLength(1);
      expect(confirmTx.__invoiceItemUpdateCalls[0].where.id).toBe(invoiceItemIdA);
      expect((confirmTx.__invoiceItemUpdateCalls[0].data.returnedQuantity as Prisma.Decimal).toString()).toBe('30');

      const matchedAllocation = confirmTx.__allocationCreateCalls.find(
        (c) => c.data.allocationType === PurchaseReturnAllocationType.MATCHED_INVOICE,
      )!.data;
      expect(matchedAllocation.purchaseInvoiceItemId).toBe(invoiceItemIdA);
      expect((matchedAllocation.baseQuantity as Prisma.Decimal).toString()).toBe('30');
    });

    it('EXACT EXHAUSTION: returning the entire receipt line (unmatched + matched) succeeds and leaves nothing remaining', async () => {
      const confirmTx = buildConfirmTx({
        purchaseReturnItems: [returnItemRow({ baseQuantity: decimal('100') })],
        grItemRows: [grItemRow({ baseQuantity: decimal('100'), unmatchedReturnedQuantity: decimal('0') })],
        matchRows: [{ id: 'match-1', goodsReceiptItemId: grItemId, matchedQuantity: decimal('60'), returnedQuantity: decimal('0') }],
        candidateSlices: [sliceRow({ quantity: decimal('60'), lineSubtotal: decimal('630.0000') })],
        lockedSliceRows: [{ id: invoiceItemId, purchaseInvoiceId: invoiceId, returnedQuantity: decimal('0') }],
        invoiceStatuses: [{ id: invoiceId, status: PurchaseInvoiceStatus.CONFIRMED }],
        lockedMatchRows: [{ id: 'match-1', goodsReceiptItemId: grItemId, returnedQuantity: decimal('0') }],
        postedResult: buildReturnRow({ status: PurchaseReturnStatus.CONFIRMED }),
      });
      const { service } = buildService({ confirmTx });

      await expect(service.confirm(actor, purchaseReturnId)).resolves.toBeDefined();

      expect(
        (confirmTx.__goodsReceiptItemUpdateCalls[0].data.unmatchedReturnedQuantity as Prisma.Decimal).toString(),
      ).toBe('40');
      expect((confirmTx.__invoiceItemUpdateCalls[0].data.returnedQuantity as Prisma.Decimal).toString()).toBe('60');
    });

    it('INSUFFICIENT QUANTITY: rejects when the request exceeds unmatched + matched capacity combined, with no writes performed', async () => {
      const confirmTx = buildConfirmTx({
        purchaseReturnItems: [returnItemRow({ baseQuantity: decimal('101') })],
        grItemRows: [grItemRow({ baseQuantity: decimal('100'), unmatchedReturnedQuantity: decimal('0') })],
        matchRows: [{ id: 'match-1', goodsReceiptItemId: grItemId, matchedQuantity: decimal('60'), returnedQuantity: decimal('0') }],
        candidateSlices: [sliceRow({ quantity: decimal('60'), lineSubtotal: decimal('630.0000') })],
        postedResult: buildReturnRow({ status: PurchaseReturnStatus.CONFIRMED }),
      });
      const { service } = buildService({ confirmTx });

      await expect(service.confirm(actor, purchaseReturnId)).rejects.toBeInstanceOf(ConflictException);

      expect(confirmTx.__allocationCreateCalls).toHaveLength(0);
      expect(confirmTx.__goodsReceiptItemUpdateCalls).toHaveLength(0);
      expect(confirmTx.__invoiceItemUpdateCalls).toHaveLength(0);
      expect(confirmTx.__matchUpdateCalls).toHaveLength(0);
    });

    it('rejects when a matched slice is no longer CONFIRMED under lock (concurrent invoice cancellation)', async () => {
      const confirmTx = buildConfirmTx({
        purchaseReturnItems: [returnItemRow({ baseQuantity: decimal('30') })],
        grItemRows: [grItemRow({ baseQuantity: decimal('60'), unmatchedReturnedQuantity: decimal('0') })],
        matchRows: [{ id: 'match-1', goodsReceiptItemId: grItemId, matchedQuantity: decimal('60'), returnedQuantity: decimal('0') }],
        candidateSlices: [sliceRow({ quantity: decimal('60'), lineSubtotal: decimal('630.0000') })],
        lockedSliceRows: [{ id: invoiceItemId, purchaseInvoiceId: invoiceId, returnedQuantity: decimal('0') }],
        // Cancelled between the soft read and the lock.
        invoiceStatuses: [{ id: invoiceId, status: PurchaseInvoiceStatus.CANCELLED }],
        postedResult: buildReturnRow({ status: PurchaseReturnStatus.CONFIRMED }),
      });
      const { service } = buildService({ confirmTx });

      await expect(service.confirm(actor, purchaseReturnId)).rejects.toBeInstanceOf(ConflictException);
      expect(confirmTx.__invoiceItemUpdateCalls).toHaveLength(0);
    });

    it('never throws on an accounting-posting failure: confirm() still resolves CONFIRMED, accountingPostingStatus becomes FAILED', async () => {
      const confirmTx = buildConfirmTx({
        purchaseReturnItems: [returnItemRow({ baseQuantity: decimal('40') })],
        grItemRows: [grItemRow({ unmatchedReturnedQuantity: decimal('0') })],
        matchRows: [],
        postedResult: buildReturnRow({
          status: PurchaseReturnStatus.CONFIRMED,
          items: [
            {
              ...returnItemRow(),
              goodsReceiptItem: { inventoryMovementId: movementId },
              allocations: [
                {
                  id: 'alloc-1',
                  allocationType: PurchaseReturnAllocationType.UNMATCHED_RECEIPT,
                  purchaseInvoiceItemId: null,
                  baseQuantity: decimal('40'),
                  receiptUnitCost: decimal('10.0000'),
                  receiptCostAmount: decimal('400.0000'),
                  invoiceUnitCost: null,
                  invoiceCostAmount: null,
                  ppvAmount: null,
                  createdAt: new Date(),
                },
              ],
            },
          ],
        }),
      });
      const postJournal = jest.fn().mockRejectedValue(new Error('accounting service unreachable'));
      const updateReturn = jest.fn().mockResolvedValue(
        buildReturnRow({ status: PurchaseReturnStatus.CONFIRMED, accountingPostingStatus: PurchaseReturnPostingStatus.FAILED }),
      );
      const findFirstReturn = jest.fn().mockResolvedValue(
        buildReturnRow({ status: PurchaseReturnStatus.CONFIRMED, accountingPostingStatus: PurchaseReturnPostingStatus.FAILED }),
      );
      const { service } = buildService({ confirmTx, postJournal, updateReturn, findFirstReturn });

      const result = await service.confirm(actor, purchaseReturnId);

      expect(result.status).toBe('CONFIRMED');
      expect(result.accountingPostingStatus).toBe('FAILED');
    });
  });

  // ============ CONFIRM() — inventoryMovementId capture (Phase 3.6 prerequisite) ============

  describe('confirm() — inventoryMovementId capture (Phase 3.6 prerequisite)', () => {
    it("persists inventoryMovementId on the PurchaseReturnItem from applyReturn()'s response", async () => {
      const newMovementId = '77777777-7777-4777-8777-777777777998';
      const applyReturn = jest.fn().mockResolvedValue({
        created: true,
        movements: [{ id: newMovementId, productId, unitCost: null, totalCost: null }],
      });
      const confirmTx = buildConfirmTx({
        purchaseReturnItems: [returnItemRow({ baseQuantity: decimal('40') })],
        grItemRows: [grItemRow({ unmatchedReturnedQuantity: decimal('0') })],
        matchRows: [],
        postedResult: buildReturnRow({ status: PurchaseReturnStatus.CONFIRMED }),
      });
      const { service } = buildService({ confirmTx, applyReturn });

      await service.confirm(actor, purchaseReturnId);

      expect(confirmTx.__purchaseReturnItemUpdateCalls).toEqual([
        { where: { id: returnItemId }, data: { inventoryMovementId: newMovementId } },
      ]);
    });

    it('positional mapping: two lines sharing the same productId each get their own captured movement id, not swapped', async () => {
      const grItemIdB = 'dddddddd-dddd-4ddd-8ddd-dddddddddde1';
      const returnItemIdB = '88888888-8888-4888-8888-888888888889';
      const movementIdA = '77777777-7777-4777-8777-777777777771';
      const movementIdB = '77777777-7777-4777-8777-777777777772';

      const itemA = {
        ...returnItemRow({ baseQuantity: decimal('10') }),
        goodsReceiptItem: { inventoryMovementId: movementId },
        allocations: [],
      };
      const itemB = {
        ...returnItemRow({ id: returnItemIdB, goodsReceiptItemId: grItemIdB, baseQuantity: decimal('20') }),
        goodsReceiptItem: { inventoryMovementId: movementId },
        allocations: [],
      };
      const findFirstReturn = jest.fn().mockResolvedValue(buildReturnRow({ items: [itemA, itemB] }));

      // Same productId on both lines — movements[] must still be matched
      // positionally (index 0 -> itemA, index 1 -> itemB), never by productId.
      const applyReturn = jest.fn().mockResolvedValue({
        created: true,
        movements: [
          { id: movementIdA, productId, unitCost: null, totalCost: null },
          { id: movementIdB, productId, unitCost: null, totalCost: null },
        ],
      });

      const confirmTx = buildConfirmTx({
        purchaseReturnItems: [
          returnItemRow({ baseQuantity: decimal('10') }),
          returnItemRow({ id: returnItemIdB, goodsReceiptItemId: grItemIdB, baseQuantity: decimal('20') }),
        ],
        grItemRows: [
          grItemRow({ unmatchedReturnedQuantity: decimal('0') }),
          grItemRow({ id: grItemIdB, unmatchedReturnedQuantity: decimal('0'), baseQuantity: decimal('100') }),
        ],
        matchRows: [],
        postedResult: buildReturnRow({ status: PurchaseReturnStatus.CONFIRMED }),
      });

      const { service } = buildService({ confirmTx, applyReturn, findFirstReturn });

      await service.confirm(actor, purchaseReturnId);

      expect(confirmTx.__purchaseReturnItemUpdateCalls).toHaveLength(2);
      const updateA = confirmTx.__purchaseReturnItemUpdateCalls.find((c) => c.where.id === returnItemId)!;
      const updateB = confirmTx.__purchaseReturnItemUpdateCalls.find((c) => c.where.id === returnItemIdB)!;
      expect(updateA.data).toEqual({ inventoryMovementId: movementIdA });
      expect(updateB.data).toEqual({ inventoryMovementId: movementIdB });
    });

    it('rejects when Inventory returns a different number of movements than lines sent, before starting the transaction', async () => {
      const applyReturn = jest.fn().mockResolvedValue({ created: true, movements: [] });
      const { service, prisma } = buildService({ applyReturn });

      await expect(service.confirm(actor, purchaseReturnId)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('does not overwrite an already-populated inventoryMovementId', async () => {
      const existingMovementId = '77777777-7777-4777-8777-777777777999';
      const confirmTx = buildConfirmTx({
        purchaseReturnItems: [
          returnItemRow({ baseQuantity: decimal('40'), inventoryMovementId: existingMovementId }),
        ],
        grItemRows: [grItemRow({ unmatchedReturnedQuantity: decimal('0') })],
        matchRows: [],
        postedResult: buildReturnRow({ status: PurchaseReturnStatus.CONFIRMED }),
      });
      const { service } = buildService({ confirmTx });

      await service.confirm(actor, purchaseReturnId);

      expect(confirmTx.__purchaseReturnItemUpdateCalls).toHaveLength(0);
    });
  });

  // ============================== REVERSE (Phase 3.6) ========================

  describe('reverse()', () => {
    /** A CONFIRMED PurchaseReturn row with one item carrying a captured inventoryMovementId. */
    function confirmedReturnRow(overrides: Record<string, unknown> = {}) {
      return buildReturnRow({
        status: PurchaseReturnStatus.CONFIRMED,
        accountingPostingStatus: PurchaseReturnPostingStatus.POSTED,
        journalEntryId: 'je-1',
        items: [
          {
            ...returnItemRow({ baseQuantity: decimal('40'), inventoryMovementId: movementId }),
            goodsReceiptItem: { inventoryMovementId: movementId },
            allocations: [],
          },
        ],
        ...overrides,
      });
    }

    function reverseTxForUnmatchedOnly(overrides: {
      baseQuantity?: Prisma.Decimal;
      currentUnmatchedReturnedQuantity?: Prisma.Decimal;
      postedResult?: Record<string, unknown>;
    } = {}) {
      return buildReverseTx({
        purchaseReturnItems: [
          {
            id: returnItemId,
            goodsReceiptItemId: grItemId,
            allocations: [
              {
                allocationType: PurchaseReturnAllocationType.UNMATCHED_RECEIPT,
                baseQuantity: overrides.baseQuantity ?? decimal('40'),
                purchaseInvoiceItemId: null,
              },
            ],
          },
        ],
        grItemRows: [
          {
            id: grItemId,
            unmatchedReturnedQuantity: overrides.currentUnmatchedReturnedQuantity ?? decimal('40'),
          },
        ],
        postedResult:
          overrides.postedResult ??
          buildReturnRow({ status: PurchaseReturnStatus.REVERSED, accountingPostingStatus: PurchaseReturnPostingStatus.NOT_POSTED }),
      });
    }

    it('is idempotent: reversing an already-REVERSED return returns it without calling Inventory again', async () => {
      const findFirstReturn = jest
        .fn()
        .mockResolvedValue(confirmedReturnRow({ status: PurchaseReturnStatus.REVERSED }));
      const applyReturn = jest.fn();
      const { service } = buildService({ findFirstReturn, applyReturn });

      const result = await service.reverse(actor, purchaseReturnId, {});

      expect(result.status).toBe('REVERSED');
      expect(applyReturn).not.toHaveBeenCalled();
    });

    it('rejects reversing a DRAFT return', async () => {
      const findFirstReturn = jest
        .fn()
        .mockResolvedValue(buildReturnRow({ status: PurchaseReturnStatus.DRAFT }));
      const { service } = buildService({ findFirstReturn });
      await expect(service.reverse(actor, purchaseReturnId, {})).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects a legacy item with no captured inventoryMovementId, without calling Inventory', async () => {
      const findFirstReturn = jest.fn().mockResolvedValue(
        confirmedReturnRow({
          items: [
            {
              ...returnItemRow({ inventoryMovementId: null }),
              goodsReceiptItem: { inventoryMovementId: movementId },
              allocations: [],
            },
          ],
        }),
      );
      const applyReturn = jest.fn();
      const { service } = buildService({ findFirstReturn, applyReturn });
      await expect(service.reverse(actor, purchaseReturnId, {})).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(applyReturn).not.toHaveBeenCalled();
    });

    it("calls Inventory with referenceType 'purchase_return_reversal' and originalMovementId sourced from PurchaseReturnItem.inventoryMovementId", async () => {
      const findFirstReturn = jest.fn().mockResolvedValue(confirmedReturnRow());
      const reverseTx = reverseTxForUnmatchedOnly();
      const applyReturn = jest.fn().mockResolvedValue({
        created: true,
        movements: [{ id: 'rev-mv-1', productId, unitCost: null, totalCost: null }],
      });
      const { service } = buildService({ findFirstReturn, reverseTx, applyReturn });

      await service.reverse(actor, purchaseReturnId, {});

      expect(applyReturn).toHaveBeenCalledWith(actor, {
        referenceType: 'purchase_return_reversal',
        referenceId: purchaseReturnId,
        warehouseId,
        lines: [{ productId, quantity: '40.000000', originalMovementId: movementId }],
      });
    });

    it('UNMATCHED-ONLY: restores unmatchedReturnedQuantity to its pre-return value, match table untouched', async () => {
      const findFirstReturn = jest.fn().mockResolvedValue(confirmedReturnRow());
      const reverseTx = reverseTxForUnmatchedOnly();
      const { service } = buildService({ findFirstReturn, reverseTx });

      const result = await service.reverse(actor, purchaseReturnId, {});

      expect(result.status).toBe('REVERSED');
      expect(reverseTx.__goodsReceiptItemUpdateCalls).toHaveLength(1);
      expect(
        (reverseTx.__goodsReceiptItemUpdateCalls[0].data.unmatchedReturnedQuantity as Prisma.Decimal).toString(),
      ).toBe('0');
      expect(reverseTx.__invoiceItemUpdateCalls).toHaveLength(0);
      expect(reverseTx.__matchUpdateCalls).toHaveLength(0);
    });

    it('MATCHED-ONLY: restores the slice and match-row returnedQuantity, matchedQuantity never referenced', async () => {
      const findFirstReturn = jest.fn().mockResolvedValue(confirmedReturnRow());
      const reverseTx = buildReverseTx({
        purchaseReturnItems: [
          {
            id: returnItemId,
            goodsReceiptItemId: grItemId,
            allocations: [
              {
                allocationType: PurchaseReturnAllocationType.MATCHED_INVOICE,
                baseQuantity: decimal('40'),
                purchaseInvoiceItemId: invoiceItemId,
              },
            ],
          },
        ],
        sliceRows: [{ id: invoiceItemId, purchaseInvoiceId: invoiceId, returnedQuantity: decimal('40') }],
        invoiceStatuses: [{ id: invoiceId, status: PurchaseInvoiceStatus.CONFIRMED }],
        matchRows: [{ id: 'match-1', goodsReceiptItemId: grItemId, returnedQuantity: decimal('40') }],
        postedResult: buildReturnRow({ status: PurchaseReturnStatus.REVERSED }),
      });
      const { service } = buildService({ findFirstReturn, reverseTx });

      await service.reverse(actor, purchaseReturnId, {});

      expect(reverseTx.__goodsReceiptItemUpdateCalls).toHaveLength(0);
      expect(reverseTx.__invoiceItemUpdateCalls).toEqual([
        { where: { id: invoiceItemId }, data: { returnedQuantity: decimal('0') } },
      ]);
      // matchedQuantity is NEVER referenced in the update payload — only returnedQuantity.
      expect(reverseTx.__matchUpdateCalls).toEqual([
        { where: { id: 'match-1' }, data: { returnedQuantity: decimal('0') } },
      ]);
    });

    it('MIXED: restores both the unmatched bucket and the matched slice/match row in one transaction', async () => {
      const findFirstReturn = jest.fn().mockResolvedValue(confirmedReturnRow());
      const reverseTx = buildReverseTx({
        purchaseReturnItems: [
          {
            id: returnItemId,
            goodsReceiptItemId: grItemId,
            allocations: [
              {
                allocationType: PurchaseReturnAllocationType.UNMATCHED_RECEIPT,
                baseQuantity: decimal('10'),
                purchaseInvoiceItemId: null,
              },
              {
                allocationType: PurchaseReturnAllocationType.MATCHED_INVOICE,
                baseQuantity: decimal('30'),
                purchaseInvoiceItemId: invoiceItemId,
              },
            ],
          },
        ],
        grItemRows: [{ id: grItemId, unmatchedReturnedQuantity: decimal('10') }],
        sliceRows: [{ id: invoiceItemId, purchaseInvoiceId: invoiceId, returnedQuantity: decimal('30') }],
        invoiceStatuses: [{ id: invoiceId, status: PurchaseInvoiceStatus.CONFIRMED }],
        matchRows: [{ id: 'match-1', goodsReceiptItemId: grItemId, returnedQuantity: decimal('30') }],
        postedResult: buildReturnRow({ status: PurchaseReturnStatus.REVERSED }),
      });
      const { service } = buildService({ findFirstReturn, reverseTx });

      await service.reverse(actor, purchaseReturnId, {});

      expect(
        (reverseTx.__goodsReceiptItemUpdateCalls[0].data.unmatchedReturnedQuantity as Prisma.Decimal).toString(),
      ).toBe('0');
      expect(
        (reverseTx.__invoiceItemUpdateCalls[0].data.returnedQuantity as Prisma.Decimal).toString(),
      ).toBe('0');
      expect(
        (reverseTx.__matchUpdateCalls[0].data.returnedQuantity as Prisma.Decimal).toString(),
      ).toBe('0');
    });

    it('defensive negative-value guard: rejects rather than clamps when restoration would drive a counter negative', async () => {
      const findFirstReturn = jest.fn().mockResolvedValue(confirmedReturnRow());
      // Inconsistent state: only 10 was ever recorded as unmatched-returned,
      // but this allocation claims to have contributed 40 — should never
      // happen under correct operation, but must be rejected, not clamped.
      const reverseTx = reverseTxForUnmatchedOnly({
        currentUnmatchedReturnedQuantity: decimal('10'),
      });
      const { service } = buildService({ findFirstReturn, reverseTx });

      await expect(service.reverse(actor, purchaseReturnId, {})).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('never throws on an accounting-reversal failure: reverse() still resolves REVERSED, accountingPostingStatus stays POSTED (no new FAILED-for-reversal state)', async () => {
      const findFirstReturn = jest
        .fn()
        .mockResolvedValueOnce(confirmedReturnRow())
        .mockResolvedValue(
          confirmedReturnRow({ status: PurchaseReturnStatus.REVERSED }),
        );
      const reverseTx = reverseTxForUnmatchedOnly({
        postedResult: buildReturnRow({
          status: PurchaseReturnStatus.REVERSED,
          accountingPostingStatus: PurchaseReturnPostingStatus.POSTED,
          journalEntryId: 'je-1',
        }),
      });
      const reverseJournal = jest.fn().mockRejectedValue(new Error('accounting service unreachable'));
      const { service } = buildService({ findFirstReturn, reverseTx, reverseJournal });

      const result = await service.reverse(actor, purchaseReturnId, {});

      expect(result.status).toBe('REVERSED');
      expect(result.accountingPostingStatus).toBe('POSTED');
    });

    it("'nothing to reverse' branch: skips the accounting call entirely when the original forward posting was never POSTED", async () => {
      const findFirstReturn = jest.fn().mockResolvedValue(
        confirmedReturnRow({ accountingPostingStatus: PurchaseReturnPostingStatus.FAILED, journalEntryId: null }),
      );
      const reverseTx = reverseTxForUnmatchedOnly({
        postedResult: buildReturnRow({
          status: PurchaseReturnStatus.REVERSED,
          accountingPostingStatus: PurchaseReturnPostingStatus.FAILED,
        }),
      });
      const reverseJournal = jest.fn();
      const { service } = buildService({ findFirstReturn, reverseTx, reverseJournal });

      const result = await service.reverse(actor, purchaseReturnId, {});

      expect(result.status).toBe('REVERSED');
      expect(reverseJournal).not.toHaveBeenCalled();
    });

    it('on accounting success, calls .reverse() with sourceType PURCHASE_RETURN and reversalSourceType PURCHASE_RETURN_REVERSAL, and persists REVERSED/reversalJournalEntryId', async () => {
      const findFirstReturn = jest.fn().mockResolvedValue(confirmedReturnRow());
      const reverseTx = reverseTxForUnmatchedOnly({
        postedResult: buildReturnRow({
          status: PurchaseReturnStatus.REVERSED,
          accountingPostingStatus: PurchaseReturnPostingStatus.POSTED,
          journalEntryId: 'je-1',
        }),
      });
      const reverseJournal = jest.fn().mockResolvedValue({ id: 'je-rev-1', idempotentReplay: false });
      const updateReturn = jest.fn().mockResolvedValue(
        buildReturnRow({
          status: PurchaseReturnStatus.REVERSED,
          accountingPostingStatus: PurchaseReturnPostingStatus.REVERSED,
          reversalJournalEntryId: 'je-rev-1',
        }),
      );
      const { service } = buildService({ findFirstReturn, reverseTx, reverseJournal, updateReturn });

      const result = await service.reverse(actor, purchaseReturnId, {});

      expect(reverseJournal).toHaveBeenCalledWith(actor, expect.objectContaining({
        sourceType: 'PURCHASE_RETURN',
        sourceId: purchaseReturnId,
        reversalSourceType: 'PURCHASE_RETURN_REVERSAL',
      }));
      expect(result.accountingPostingStatus).toBe('REVERSED');
    });
  });

  // =================== RETRY ACCOUNTING REVERSAL (Phase 3.6) =================

  describe('retryAccountingReversal()', () => {
    function reversedReturnRow(overrides: Record<string, unknown> = {}) {
      return buildReturnRow({
        status: PurchaseReturnStatus.REVERSED,
        accountingPostingStatus: PurchaseReturnPostingStatus.POSTED,
        journalEntryId: 'je-1',
        ...overrides,
      });
    }

    it('rejects when the return is not yet REVERSED', async () => {
      const findFirstReturn = jest
        .fn()
        .mockResolvedValue(buildReturnRow({ status: PurchaseReturnStatus.CONFIRMED }));
      const { service } = buildService({ findFirstReturn });
      await expect(
        service.retryAccountingReversal(actor, purchaseReturnId),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('no-ops when the accounting reversal already succeeded', async () => {
      const findFirstReturn = jest.fn().mockResolvedValue(
        reversedReturnRow({ accountingPostingStatus: PurchaseReturnPostingStatus.REVERSED }),
      );
      const reverseJournal = jest.fn();
      const { service } = buildService({ findFirstReturn, reverseJournal });

      const result = await service.retryAccountingReversal(actor, purchaseReturnId);

      expect(result.accountingPostingStatus).toBe('REVERSED');
      expect(reverseJournal).not.toHaveBeenCalled();
    });

    it('rejects when there is no posted journal to reverse', async () => {
      const findFirstReturn = jest.fn().mockResolvedValue(
        reversedReturnRow({ accountingPostingStatus: PurchaseReturnPostingStatus.FAILED, journalEntryId: null }),
      );
      const { service } = buildService({ findFirstReturn });
      await expect(
        service.retryAccountingReversal(actor, purchaseReturnId),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('surfaces a renewed reversal failure to the caller', async () => {
      const findFirstReturn = jest.fn().mockResolvedValue(reversedReturnRow());
      const reverseJournal = jest.fn().mockRejectedValue(new Error('still unreachable'));
      const { service } = buildService({ findFirstReturn, reverseJournal });

      await expect(
        service.retryAccountingReversal(actor, purchaseReturnId),
      ).rejects.toThrow('still unreachable');
    });

    it('succeeds and persists reversalJournalEntryId on a successful retry', async () => {
      const findFirstReturn = jest.fn().mockResolvedValue(reversedReturnRow());
      const reverseJournal = jest.fn().mockResolvedValue({ id: 'je-rev-2', idempotentReplay: false });
      const updateReturn = jest.fn().mockResolvedValue(
        reversedReturnRow({
          accountingPostingStatus: PurchaseReturnPostingStatus.REVERSED,
          reversalJournalEntryId: 'je-rev-2',
        }),
      );
      const { service } = buildService({ findFirstReturn, reverseJournal, updateReturn });

      const result = await service.retryAccountingReversal(actor, purchaseReturnId);

      expect(result.accountingPostingStatus).toBe('REVERSED');
      expect(result.reversalJournalEntryId).toBe('je-rev-2');
    });
  });

  // ==================== ACCOUNTING JOURNAL + RETRY ==========================

  describe('retryAccountingPosting()', () => {
    function returnWithAllocations(allocations: Array<Record<string, unknown>>) {
      return buildReturnRow({
        status: PurchaseReturnStatus.CONFIRMED,
        accountingPostingStatus: PurchaseReturnPostingStatus.FAILED,
        items: [
          {
            ...returnItemRow(),
            goodsReceiptItem: { inventoryMovementId: movementId },
            allocations,
          },
        ],
      });
    }

    it('posts Dr GRNI / Cr Inventory Asset for an UNMATCHED_RECEIPT-only return', async () => {
      const findFirstReturn = jest.fn().mockResolvedValue(
        returnWithAllocations([
          {
            allocationType: PurchaseReturnAllocationType.UNMATCHED_RECEIPT,
            receiptCostAmount: decimal('400.0000'),
            invoiceCostAmount: null,
            ppvAmount: null,
          },
        ]),
      );
      const postJournal = jest.fn().mockResolvedValue({ id: 'je-1', idempotentReplay: false });
      const { service } = buildService({ findFirstReturn, postJournal });

      await service.retryAccountingPosting(actor, purchaseReturnId);

      const request = postJournal.mock.calls[0][1];
      expect(request.sourceType).toBe('PURCHASE_RETURN');
      expect(request.lines).toEqual([
        { role: 'GOODS_RECEIVED_NOT_INVOICED', side: 'DEBIT', amount: '400.0000' },
        { role: 'INVENTORY_ASSET', side: 'CREDIT', amount: '400.0000' },
      ]);
    });

    it('posts the full split journal for the worked example: Dr GRNI 400 / Dr AP 315 / Cr Inventory 700 / Cr PPV 15 — balances', async () => {
      const findFirstReturn = jest.fn().mockResolvedValue(
        returnWithAllocations([
          {
            allocationType: PurchaseReturnAllocationType.UNMATCHED_RECEIPT,
            receiptCostAmount: decimal('400.0000'),
            invoiceCostAmount: null,
            ppvAmount: null,
          },
          {
            allocationType: PurchaseReturnAllocationType.MATCHED_INVOICE,
            receiptCostAmount: decimal('300.0000'),
            invoiceCostAmount: decimal('315.0000'),
            ppvAmount: decimal('15.0000'),
          },
        ]),
      );
      const postJournal = jest.fn().mockResolvedValue({ id: 'je-1', idempotentReplay: false });
      const { service } = buildService({ findFirstReturn, postJournal });

      await service.retryAccountingPosting(actor, purchaseReturnId);

      const request = postJournal.mock.calls[0][1];
      const byRole = Object.fromEntries(
        request.lines.map((l: { role: string; side: string; amount: string }) => [l.role, l]),
      );
      expect(byRole.GOODS_RECEIVED_NOT_INVOICED).toEqual({ role: 'GOODS_RECEIVED_NOT_INVOICED', side: 'DEBIT', amount: '400.0000' });
      expect(byRole.ACCOUNTS_PAYABLE).toEqual({ role: 'ACCOUNTS_PAYABLE', side: 'DEBIT', amount: '315.0000' });
      expect(byRole.INVENTORY_ASSET).toEqual({ role: 'INVENTORY_ASSET', side: 'CREDIT', amount: '700.0000' });
      expect(byRole.PURCHASE_PRICE_VARIANCE).toEqual({ role: 'PURCHASE_PRICE_VARIANCE', side: 'CREDIT', amount: '15.0000' });

      const totalDebit = request.lines
        .filter((l: { side: string }) => l.side === 'DEBIT')
        .reduce((sum: number, l: { amount: string }) => sum + Number(l.amount), 0);
      const totalCredit = request.lines
        .filter((l: { side: string }) => l.side === 'CREDIT')
        .reduce((sum: number, l: { amount: string }) => sum + Number(l.amount), 0);
      expect(totalDebit).toBe(totalCredit);
    });

    it('posts Dr PPV (not Cr) when the matched allocation is a favorable variance (ppvAmount negative)', async () => {
      const findFirstReturn = jest.fn().mockResolvedValue(
        returnWithAllocations([
          {
            allocationType: PurchaseReturnAllocationType.MATCHED_INVOICE,
            receiptCostAmount: decimal('300.0000'),
            invoiceCostAmount: decimal('280.0000'),
            ppvAmount: decimal('-20.0000'),
          },
        ]),
      );
      const postJournal = jest.fn().mockResolvedValue({ id: 'je-1', idempotentReplay: false });
      const { service } = buildService({ findFirstReturn, postJournal });

      await service.retryAccountingPosting(actor, purchaseReturnId);

      const request = postJournal.mock.calls[0][1];
      const ppvLine = request.lines.find((l: { role: string }) => l.role === 'PURCHASE_PRICE_VARIANCE');
      expect(ppvLine).toEqual({ role: 'PURCHASE_PRICE_VARIANCE', side: 'DEBIT', amount: '20.0000' });
    });

    it('is a no-op when already POSTED — never calls accounting-service again', async () => {
      const findFirstReturn = jest.fn().mockResolvedValue(
        buildReturnRow({ status: PurchaseReturnStatus.CONFIRMED, accountingPostingStatus: PurchaseReturnPostingStatus.POSTED }),
      );
      const postJournal = jest.fn();
      const { service } = buildService({ findFirstReturn, postJournal });

      const result = await service.retryAccountingPosting(actor, purchaseReturnId);

      expect(result.accountingPostingStatus).toBe('POSTED');
      expect(postJournal).not.toHaveBeenCalled();
    });

    it('rejects retrying a DRAFT purchase return', async () => {
      const findFirstReturn = jest.fn().mockResolvedValue(buildReturnRow({ status: PurchaseReturnStatus.DRAFT }));
      const { service } = buildService({ findFirstReturn });
      await expect(service.retryAccountingPosting(actor, purchaseReturnId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('surfaces the error when accounting-service fails on retry (unlike confirm()\'s best-effort call)', async () => {
      const findFirstReturn = jest.fn().mockResolvedValue(
        returnWithAllocations([
          {
            allocationType: PurchaseReturnAllocationType.UNMATCHED_RECEIPT,
            receiptCostAmount: decimal('400.0000'),
            invoiceCostAmount: null,
            ppvAmount: null,
          },
        ]),
      );
      const postJournal = jest.fn().mockRejectedValue(new Error('accounting service unreachable'));
      const { service } = buildService({ findFirstReturn, postJournal });

      await expect(service.retryAccountingPosting(actor, purchaseReturnId)).rejects.toThrow(
        'accounting service unreachable',
      );
    });
  });
});
