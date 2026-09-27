import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  SalesInvoiceStatus,
  SalesReturnPostingStatus,
  SalesReturnStatus,
} from '../../generated/prisma-client';
import { SalesReturnsService } from './sales-returns.service';

describe('SalesReturnsService', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const actor = { userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', tenantId };
  const invoiceId = 'inv-1';
  const returnId = 'ret-1';
  const invoiceItemId = 'sii-1';
  const shipmentItemId = 'shi-1';
  const warehouseId = 'wh-1';

  function decimal(v: string) {
    return new Prisma.Decimal(v);
  }

  function makeAudit() {
    return { record: jest.fn().mockResolvedValue(undefined) };
  }
  function makeInventory(overrides: Partial<{ applyReturn: jest.Mock }> = {}) {
    return {
      applyReturn: jest.fn().mockResolvedValue({ created: true, movements: [] }),
      ...overrides,
    };
  }
  function makeAccountingJournal(
    overrides: Partial<{ post: jest.Mock; reverse: jest.Mock }> = {},
  ) {
    return {
      post: jest.fn().mockResolvedValue({ id: 'je-1', idempotentReplay: false }),
      reverse: jest.fn().mockResolvedValue({ id: 'je-rev-1', idempotentReplay: false }),
      ...overrides,
    };
  }

  function invoiceItemRow(overrides: Record<string, unknown> = {}) {
    return {
      id: invoiceItemId,
      tenantId,
      salesInvoiceId: invoiceId,
      productId: 'p1',
      productSku: 'SKU-1',
      productName: 'Widget',
      quantity: decimal('10'),
      unitOfMeasureId: 'u1',
      uomCode: 'EA',
      uomName: 'Each',
      conversionFactor: decimal('1'),
      unitPrice: decimal('10'),
      discountPercent: decimal('0'),
      discountAmount: decimal('0'),
      taxCodeId: null,
      taxCode: null,
      taxCodeName: null,
      taxAmount: decimal('0'),
      lineSubtotal: decimal('100'),
      lineTotal: decimal('100'),
      returnedQuantity: decimal('0'),
      ...overrides,
    };
  }

  function invoiceRow(overrides: Record<string, unknown> = {}) {
    return {
      id: invoiceId,
      tenantId,
      status: SalesInvoiceStatus.SENT,
      amountCredited: decimal('0'),
      items: [invoiceItemRow()],
      ...overrides,
    };
  }

  function shipmentItemRow(overrides: Record<string, unknown> = {}) {
    return {
      id: shipmentItemId,
      tenantId,
      shipmentId: 'ship-1',
      productId: 'p1',
      productSku: 'SKU-1',
      productName: 'Widget',
      quantity: decimal('10'),
      baseQuantity: decimal('10'),
      conversionFactor: decimal('1'),
      returnedQuantity: decimal('0'),
      inventoryMovementId: 'move-orig-1',
      shipment: { warehouseId },
      ...overrides,
    };
  }

  function returnItemRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'sri-1',
      tenantId,
      salesReturnId: returnId,
      salesInvoiceItemId: invoiceItemId,
      shipmentItemId: null,
      productId: 'p1',
      productSku: 'SKU-1',
      productName: 'Widget',
      quantity: decimal('5'),
      baseQuantity: null,
      unitPrice: decimal('10'),
      discountPercent: decimal('0'),
      discountAmount: decimal('0'),
      taxCodeId: null,
      taxCode: null,
      taxCodeName: null,
      taxAmount: decimal('0'),
      lineSubtotal: decimal('50'),
      lineTotal: decimal('50'),
      unitCost: null,
      totalCost: null,
      inventoryMovementId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  function returnRow(overrides: Record<string, unknown> = {}) {
    return {
      id: returnId,
      tenantId,
      returnNumber: 'SRET-00000001',
      salesInvoiceId: invoiceId,
      warehouseId: null,
      status: SalesReturnStatus.DRAFT,
      reason: null,
      returnedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      accountingPostingStatus: SalesReturnPostingStatus.NOT_POSTED,
      journalEntryId: null,
      reversalJournalEntryId: null,
      reversedAt: null,
      reversalReason: null,
      items: [returnItemRow()],
      ...overrides,
    };
  }

  // ==================== create() — validation ====================

  describe('create()', () => {
    function buildService(prisma: unknown, options: { inventory?: unknown } = {}) {
      return new SalesReturnsService(
        prisma as never,
        (options.inventory ?? makeInventory()) as never,
        makeAccountingJournal() as never,
        makeAudit() as never,
      );
    }

    it('rejects when the sales invoice does not exist', async () => {
      const prisma = { salesInvoice: { findFirst: jest.fn().mockResolvedValue(null) } };
      const service = buildService(prisma);
      await expect(
        service.create(actor, { salesInvoiceId: invoiceId, items: [{ salesInvoiceItemId: invoiceItemId, quantity: '1' }] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects when the sales invoice is not SENT', async () => {
      const prisma = {
        salesInvoice: {
          findFirst: jest.fn().mockResolvedValue(invoiceRow({ status: SalesInvoiceStatus.DRAFT })),
        },
      };
      const service = buildService(prisma);
      await expect(
        service.create(actor, { salesInvoiceId: invoiceId, items: [{ salesInvoiceItemId: invoiceItemId, quantity: '1' }] }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a line with neither salesInvoiceItemId nor shipmentItemId (defense-in-depth)', async () => {
      const prisma = { salesInvoice: { findFirst: jest.fn().mockResolvedValue(invoiceRow()) } };
      const service = buildService(prisma);
      await expect(
        service.create(actor, { salesInvoiceId: invoiceId, items: [{ quantity: '1' } as never] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects duplicate salesInvoiceItemId across lines', async () => {
      const prisma = { salesInvoice: { findFirst: jest.fn().mockResolvedValue(invoiceRow()) } };
      const service = buildService(prisma);
      await expect(
        service.create(actor, {
          salesInvoiceId: invoiceId,
          items: [
            { salesInvoiceItemId: invoiceItemId, quantity: '1' },
            { salesInvoiceItemId: invoiceItemId, quantity: '2' },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a quantity exceeding the sales invoice line\'s returnable quantity', async () => {
      const prisma = {
        salesInvoice: {
          findFirst: jest.fn().mockResolvedValue(
            invoiceRow({ items: [invoiceItemRow({ quantity: decimal('10'), returnedQuantity: decimal('8') })] }),
          ),
        },
      };
      const service = buildService(prisma);
      await expect(
        service.create(actor, { salesInvoiceId: invoiceId, items: [{ salesInvoiceItemId: invoiceItemId, quantity: '3' }] }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a quantity exceeding the shipment line\'s returnable base quantity', async () => {
      const prisma = {
        salesInvoice: { findFirst: jest.fn().mockResolvedValue(invoiceRow()) },
        shipmentItem: {
          findMany: jest.fn().mockResolvedValue([
            shipmentItemRow({ baseQuantity: decimal('10'), returnedQuantity: decimal('9') }),
          ]),
        },
      };
      const service = buildService(prisma);
      await expect(
        service.create(actor, { salesInvoiceId: invoiceId, items: [{ shipmentItemId, quantity: '2' }] }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a shipment line with no captured inventoryMovementId (legacy pre-Phase-3.12 line)', async () => {
      const prisma = {
        salesInvoice: { findFirst: jest.fn().mockResolvedValue(invoiceRow()) },
        shipmentItem: {
          findMany: jest.fn().mockResolvedValue([shipmentItemRow({ inventoryMovementId: null })]),
        },
      };
      const service = buildService(prisma);
      await expect(
        service.create(actor, { salesInvoiceId: invoiceId, items: [{ shipmentItemId, quantity: '1' }] }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates a DRAFT return with an invoice-only line: pro-rates pricing by the returned fraction, no warehouseId, no Inventory call', async () => {
      const createMock = jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(returnRow({ warehouseId: data.warehouseId as string | null })),
      );
      const prisma = {
        salesInvoice: { findFirst: jest.fn().mockResolvedValue(invoiceRow()) },
        salesReturn: { count: jest.fn().mockResolvedValue(0), create: createMock },
      };
      const inventory = makeInventory();
      const service = buildService(prisma, { inventory });

      await service.create(actor, {
        salesInvoiceId: invoiceId,
        items: [{ salesInvoiceItemId: invoiceItemId, quantity: '5' }],
      });

      expect(inventory.applyReturn).not.toHaveBeenCalled();
      const createArgs = createMock.mock.calls[0][0];
      expect(createArgs.data.warehouseId).toBeNull();
      const line = createArgs.data.items.create[0];
      // 5 of 10 returned -> fraction 0.5 -> lineSubtotal/lineTotal halved from 100.
      expect((line.lineSubtotal as Prisma.Decimal).toString()).toBe('50');
      expect((line.lineTotal as Prisma.Decimal).toString()).toBe('50');
      expect(line.shipmentItemId).toBeNull();
    });

    it('creates a DRAFT return with a shipment-only line: computes baseQuantity, captures warehouseId, no pricing snapshot', async () => {
      const createMock = jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(returnRow({ warehouseId: data.warehouseId as string | null })),
      );
      const prisma = {
        salesInvoice: { findFirst: jest.fn().mockResolvedValue(invoiceRow()) },
        shipmentItem: { findMany: jest.fn().mockResolvedValue([shipmentItemRow()]) },
        salesReturn: { count: jest.fn().mockResolvedValue(0), create: createMock },
      };
      const service = buildService(prisma);

      await service.create(actor, {
        salesInvoiceId: invoiceId,
        items: [{ shipmentItemId, quantity: '4' }],
      });

      const createArgs = createMock.mock.calls[0][0];
      expect(createArgs.data.warehouseId).toBe(warehouseId);
      const line = createArgs.data.items.create[0];
      expect((line.baseQuantity as Prisma.Decimal).toString()).toBe('4');
      expect(line.unitPrice).toBeNull();
      expect(line.salesInvoiceItemId).toBeNull();
    });

    it('rejects shipment-linked lines spanning two different warehouses in one return', async () => {
      const prisma = {
        salesInvoice: { findFirst: jest.fn().mockResolvedValue(invoiceRow()) },
        shipmentItem: {
          findMany: jest.fn().mockResolvedValue([
            shipmentItemRow({ id: 'shi-1', shipment: { warehouseId: 'wh-1' } }),
            shipmentItemRow({ id: 'shi-2', shipment: { warehouseId: 'wh-2' } }),
          ]),
        },
      };
      const service = buildService(prisma);
      await expect(
        service.create(actor, {
          salesInvoiceId: invoiceId,
          items: [
            { shipmentItemId: 'shi-1', quantity: '1' },
            { shipmentItemId: 'shi-2', quantity: '1' },
          ],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  // ==================== confirm() ====================

  describe('confirm()', () => {
    /** tx mock for confirm(): $queryRaw in order — [0] sales_returns lock,
     * [1] sales_invoices lock, [2] sales_invoice_items lock,
     * [3] shipment_items lock (only if any shipment-linked line exists). */
    function buildConfirmTx(options: {
      returnStatus?: SalesReturnStatus;
      invoiceStatus?: SalesInvoiceStatus;
      returnRowOverrides?: Record<string, unknown>;
      invoiceRowOverrides?: Record<string, unknown>;
      shipmentItemRows?: Array<Record<string, unknown>>;
    }) {
      const queryRawCalls: unknown[][] = [];
      const invoiceItemUpdateCalls: Array<{ where: unknown; data: Record<string, unknown> }> = [];
      const invoiceUpdateCalls: Array<{ data: Record<string, unknown> }> = [];
      const shipmentItemUpdateCalls: Array<{ where: unknown; data: Record<string, unknown> }> = [];
      const returnItemUpdateCalls: Array<{ where: unknown; data: Record<string, unknown> }> = [];
      const baseReturn = returnRow({
        status: options.returnStatus ?? SalesReturnStatus.DRAFT,
        ...options.returnRowOverrides,
      });
      // Mutable working copy of this return's own items — mirrors how a real
      // Prisma `include` on the final salesReturn.update() re-reads whatever
      // salesReturnItem.update() wrote earlier in the SAME transaction
      // (unitCost/totalCost/inventoryMovementId), rather than a static
      // snapshot taken before those writes happened.
      const workingItems = baseReturn.items.map((item: Record<string, unknown>) => ({ ...item }));
      return {
        $queryRaw: jest.fn((...args: unknown[]) => {
          queryRawCalls.push(args);
          if (queryRawCalls.length === 1) {
            return Promise.resolve([
              { id: returnId, status: options.returnStatus ?? SalesReturnStatus.DRAFT, salesInvoiceId: invoiceId },
            ]);
          }
          return Promise.resolve([{ id: 'lock' }]);
        }),
        salesReturn: {
          findFirstOrThrow: jest.fn().mockImplementation(() =>
            Promise.resolve({ ...baseReturn, items: workingItems }),
          ),
          update: jest.fn().mockImplementation(() =>
            Promise.resolve({
              ...baseReturn,
              status: SalesReturnStatus.CONFIRMED,
              returnedAt: new Date(),
              items: workingItems,
            }),
          ),
        },
        salesInvoice: {
          findFirstOrThrow: jest.fn().mockResolvedValue(
            invoiceRow({ status: options.invoiceStatus ?? SalesInvoiceStatus.SENT, ...options.invoiceRowOverrides }),
          ),
          update: jest.fn((args: { data: Record<string, unknown> }) => {
            invoiceUpdateCalls.push(args);
            return Promise.resolve({});
          }),
        },
        salesInvoiceItem: {
          update: jest.fn((args: { where: unknown; data: Record<string, unknown> }) => {
            invoiceItemUpdateCalls.push(args);
            return Promise.resolve({});
          }),
        },
        shipmentItem: {
          findMany: jest.fn().mockResolvedValue(options.shipmentItemRows ?? []),
          update: jest.fn((args: { where: unknown; data: Record<string, unknown> }) => {
            shipmentItemUpdateCalls.push(args);
            return Promise.resolve({});
          }),
        },
        salesReturnItem: {
          update: jest.fn((args: { where: { id: string }; data: Record<string, unknown> }) => {
            returnItemUpdateCalls.push(args);
            const target = workingItems.find((item: Record<string, unknown>) => item.id === args.where.id);
            if (target) Object.assign(target, args.data);
            return Promise.resolve({});
          }),
        },
        __queryRawCalls: queryRawCalls,
        __invoiceItemUpdateCalls: invoiceItemUpdateCalls,
        __invoiceUpdateCalls: invoiceUpdateCalls,
        __shipmentItemUpdateCalls: shipmentItemUpdateCalls,
        __returnItemUpdateCalls: returnItemUpdateCalls,
      };
    }

    function buildServiceForConfirm(
      tx: ReturnType<typeof buildConfirmTx>,
      options: {
        softReturn?: Record<string, unknown>;
        outerShipmentItems?: Array<Record<string, unknown>>;
        inventory?: unknown;
        accountingJournal?: unknown;
      } = {},
    ) {
      const soft = options.softReturn ?? returnRow();
      // The outer (non-tx) prisma mock's `current` starts exactly as the
      // caller's soft/pre-confirm state (DRAFT, or CONFIRMED for the
      // idempotent-no-op test). $transaction's own wrapper flips it to
      // CONFIRMED only once the transaction actually commits — mirroring a
      // real re-read seeing the transaction's own effect — so
      // attemptReturnPosting()'s post-commit findFirst()/update() calls
      // (its failure-path re-fetch and success-path write) see the correct
      // post-commit state, while confirm()'s own INITIAL require() call
      // still sees the true pre-confirm state.
      let current: Record<string, unknown> = { ...soft };
      const prisma: any = {
        $transaction: jest.fn(async (fn: (c: unknown) => unknown) => {
          const result = await fn(tx);
          current = { ...current, status: SalesReturnStatus.CONFIRMED, returnedAt: new Date() };
          return result;
        }),
        salesReturn: {
          findFirst: jest.fn().mockImplementation(() => Promise.resolve(current)),
          update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
            current = { ...current, ...data };
            return Promise.resolve(current);
          }),
        },
        shipmentItem: {
          findMany: jest.fn().mockResolvedValue(options.outerShipmentItems ?? []),
        },
      };
      const service = new SalesReturnsService(
        prisma as never,
        (options.inventory ?? makeInventory()) as never,
        (options.accountingJournal ?? makeAccountingJournal()) as never,
        makeAudit() as never,
      );
      return { service, prisma };
    }

    it('confirms an invoice-only return: posts Dr Sales Revenue / Cr Accounts Receivable, no Inventory call, amountCredited incremented', async () => {
      const tx = buildConfirmTx({});
      const postMock = jest.fn().mockResolvedValue({ id: 'je-1', idempotentReplay: false });
      const inventory = makeInventory();
      const { service } = buildServiceForConfirm(tx, {
        inventory,
        accountingJournal: makeAccountingJournal({ post: postMock }),
      });

      const result = await service.confirm(actor, returnId);

      expect(inventory.applyReturn).not.toHaveBeenCalled();
      expect(tx.__invoiceItemUpdateCalls).toHaveLength(1);
      expect((tx.__invoiceItemUpdateCalls[0].data.returnedQuantity as Prisma.Decimal).toString()).toBe('5');
      expect(tx.__invoiceUpdateCalls).toHaveLength(1);
      expect((tx.__invoiceUpdateCalls[0].data.amountCredited as Prisma.Decimal).toString()).toBe('50');
      expect(postMock).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          sourceService: 'sales-service',
          sourceType: 'SALES_RETURN',
          lines: [
            expect.objectContaining({ role: 'SALES_REVENUE', side: 'DEBIT', amount: '50.0000' }),
            expect.objectContaining({ role: 'ACCOUNTS_RECEIVABLE', side: 'CREDIT', amount: '50.0000' }),
          ],
        }),
      );
      expect(result.status).toBe(SalesReturnStatus.CONFIRMED);
      expect(result.accountingPostingStatus).toBe(SalesReturnPostingStatus.POSTED);
    });

    it('confirms a shipment-only return: calls Inventory applyReturn(sales_return), posts Dr Inventory Asset / Cr COGS', async () => {
      const shipmentLinkedReturn = returnRow({
        items: [
          returnItemRow({
            salesInvoiceItemId: null,
            shipmentItemId,
            quantity: decimal('4'),
            baseQuantity: decimal('4'),
            unitPrice: null,
            lineSubtotal: null,
            lineTotal: null,
          }),
        ],
      });
      const tx = buildConfirmTx({
        returnRowOverrides: { ...shipmentLinkedReturn, warehouseId },
        shipmentItemRows: [shipmentItemRow()],
      });
      // Override the soft (pre-tx) confirm() read too, since confirm() reads
      // existing.items itself (outside the transaction) to build the
      // Inventory call.
      const softReturn = { ...shipmentLinkedReturn, warehouseId };
      const applyReturnMock = jest.fn().mockResolvedValue({
        created: true,
        movements: [{ id: 'move-new-1', productId: 'p1', unitCost: '8.0000', totalCost: '32.0000' }],
      });
      const postMock = jest.fn().mockResolvedValue({ id: 'je-2', idempotentReplay: false });
      const { service } = buildServiceForConfirm(tx, {
        softReturn,
        outerShipmentItems: [shipmentItemRow()],
        inventory: makeInventory({ applyReturn: applyReturnMock }),
        accountingJournal: makeAccountingJournal({ post: postMock }),
      });

      // tx's own findFirstOrThrow for salesReturn must reflect the same
      // shipment-linked shape as the soft read, so allocateAndConfirm() sees
      // a shipmentItemId to process.
      tx.salesReturn.findFirstOrThrow.mockResolvedValue(softReturn);

      const result = await service.confirm(actor, returnId);

      expect(applyReturnMock).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          referenceType: 'sales_return',
          referenceId: returnId,
          warehouseId,
          lines: [
            expect.objectContaining({ productId: 'p1', quantity: '4.000000', originalMovementId: 'move-orig-1' }),
          ],
        }),
      );
      expect(tx.__shipmentItemUpdateCalls).toHaveLength(1);
      expect((tx.__shipmentItemUpdateCalls[0].data.returnedQuantity as Prisma.Decimal).toString()).toBe('4');
      expect(tx.__returnItemUpdateCalls).toHaveLength(1);
      expect(tx.__returnItemUpdateCalls[0].data.inventoryMovementId).toBe('move-new-1');
      expect(postMock).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          lines: [
            expect.objectContaining({ role: 'INVENTORY_ASSET', side: 'DEBIT', amount: '32.0000' }),
            expect.objectContaining({ role: 'COGS', side: 'CREDIT', amount: '32.0000' }),
          ],
        }),
      );
      expect(result.status).toBe(SalesReturnStatus.CONFIRMED);
    });

    it('confirming an already-CONFIRMED return is an idempotent no-op: never calls Inventory or accounting again', async () => {
      const alreadyConfirmed = returnRow({ status: SalesReturnStatus.CONFIRMED });
      const tx = buildConfirmTx({});
      const inventory = makeInventory();
      const postMock = jest.fn();
      const { service } = buildServiceForConfirm(tx, {
        softReturn: alreadyConfirmed,
        inventory,
        accountingJournal: makeAccountingJournal({ post: postMock }),
      });

      const result = await service.confirm(actor, returnId);

      expect(inventory.applyReturn).not.toHaveBeenCalled();
      expect(postMock).not.toHaveBeenCalled();
      expect(result.status).toBe(SalesReturnStatus.CONFIRMED);
    });

    it('rejects re-verified capacity under lock even if the soft pre-transaction read was stale', async () => {
      const tx = buildConfirmTx({
        invoiceRowOverrides: { items: [invoiceItemRow({ quantity: decimal('10'), returnedQuantity: decimal('8') })] },
      });
      const { service } = buildServiceForConfirm(tx);
      await expect(service.confirm(actor, returnId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('never throws on accounting-posting failure: confirm() still resolves CONFIRMED with accountingPostingStatus FAILED', async () => {
      const tx = buildConfirmTx({});
      const failingPost = jest.fn().mockRejectedValue(new Error('accounting service unreachable'));
      const { service } = buildServiceForConfirm(tx, {
        accountingJournal: makeAccountingJournal({ post: failingPost }),
      });

      const result = await service.confirm(actor, returnId);

      expect(result.status).toBe(SalesReturnStatus.CONFIRMED);
      expect(result.accountingPostingStatus).toBe(SalesReturnPostingStatus.FAILED);
    });
  });

  // ==================== reverse() / retry ====================

  describe('reverse() and retry', () => {
    function buildReverseTx(options: {
      returnStatus?: SalesReturnStatus;
      accountingPostingStatus?: SalesReturnPostingStatus;
      journalEntryId?: string | null;
      invoiceItemReturnedQuantity?: Prisma.Decimal;
      invoiceAmountCredited?: Prisma.Decimal;
    }) {
      const invoiceItemUpdateCalls: Array<{ data: Record<string, unknown> }> = [];
      const invoiceUpdateCalls: Array<{ data: Record<string, unknown> }> = [];
      const queryRawCalls: unknown[][] = [];
      return {
        $queryRaw: jest.fn((...args: unknown[]) => {
          queryRawCalls.push(args);
          if (queryRawCalls.length === 1) {
            return Promise.resolve([
              { id: returnId, status: options.returnStatus ?? SalesReturnStatus.CONFIRMED, salesInvoiceId: invoiceId },
            ]);
          }
          return Promise.resolve([{ id: 'lock' }]);
        }),
        salesReturn: {
          findFirstOrThrow: jest.fn().mockResolvedValue(
            returnRow({
              status: options.returnStatus ?? SalesReturnStatus.CONFIRMED,
              accountingPostingStatus: options.accountingPostingStatus ?? SalesReturnPostingStatus.NOT_POSTED,
              journalEntryId: options.journalEntryId ?? null,
            }),
          ),
          update: jest.fn().mockResolvedValue(
            returnRow({
              status: SalesReturnStatus.REVERSED,
              reversedAt: new Date(),
              accountingPostingStatus: options.accountingPostingStatus ?? SalesReturnPostingStatus.NOT_POSTED,
              journalEntryId: options.journalEntryId ?? null,
            }),
          ),
        },
        salesInvoiceItem: {
          findFirstOrThrow: jest.fn().mockResolvedValue(
            invoiceItemRow({ returnedQuantity: options.invoiceItemReturnedQuantity ?? decimal('5') }),
          ),
          update: jest.fn((args: { data: Record<string, unknown> }) => {
            invoiceItemUpdateCalls.push(args);
            return Promise.resolve({});
          }),
        },
        salesInvoice: {
          findFirstOrThrow: jest.fn().mockResolvedValue(
            invoiceRow({ amountCredited: options.invoiceAmountCredited ?? decimal('50') }),
          ),
          update: jest.fn((args: { data: Record<string, unknown> }) => {
            invoiceUpdateCalls.push(args);
            return Promise.resolve({});
          }),
        },
        __queryRawCalls: queryRawCalls,
        __invoiceItemUpdateCalls: invoiceItemUpdateCalls,
        __invoiceUpdateCalls: invoiceUpdateCalls,
      };
    }

    function buildServiceForReverse(
      tx: ReturnType<typeof buildReverseTx>,
      options: { softReturn?: Record<string, unknown>; inventory?: unknown; accountingJournal?: unknown } = {},
    ) {
      const soft = options.softReturn ?? returnRow({ status: SalesReturnStatus.CONFIRMED });
      // Same stateful-current pattern as buildServiceForConfirm(): the outer
      // mock starts at the pre-reverse soft state and flips to REVERSED only
      // once the transaction actually commits, so attemptReturnReversal()'s
      // post-commit findFirst()/update() calls see the correct state.
      let current: Record<string, unknown> = { ...soft };
      const prisma: any = {
        $transaction: jest.fn(async (fn: (c: unknown) => unknown) => {
          const result = await fn(tx);
          current = { ...current, status: SalesReturnStatus.REVERSED, reversedAt: new Date() };
          return result;
        }),
        salesReturn: {
          findFirst: jest.fn().mockImplementation(() => Promise.resolve(current)),
          update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
            current = { ...current, ...data };
            return Promise.resolve(current);
          }),
        },
      };
      const service = new SalesReturnsService(
        prisma as never,
        (options.inventory ?? makeInventory()) as never,
        (options.accountingJournal ?? makeAccountingJournal()) as never,
        makeAudit() as never,
      );
      return { service };
    }

    it('reverses a CONFIRMED return: restores returnedQuantity/amountCredited, posts reversal via accountingJournal.reverse()', async () => {
      const tx = buildReverseTx({
        accountingPostingStatus: SalesReturnPostingStatus.POSTED,
        journalEntryId: 'je-1',
      });
      const reverseMock = jest.fn().mockResolvedValue({ id: 'je-rev', idempotentReplay: false });
      const { service } = buildServiceForReverse(tx, {
        softReturn: returnRow({
          status: SalesReturnStatus.CONFIRMED,
          accountingPostingStatus: SalesReturnPostingStatus.POSTED,
          journalEntryId: 'je-1',
        }),
        accountingJournal: makeAccountingJournal({ reverse: reverseMock }),
      });

      const result = await service.reverse(actor, returnId, {});

      expect(tx.__invoiceItemUpdateCalls[0].data.returnedQuantity).toEqual(decimal('0'));
      expect(tx.__invoiceUpdateCalls[0].data.amountCredited).toEqual(decimal('0'));
      expect(reverseMock).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          sourceService: 'sales-service',
          sourceType: 'SALES_RETURN',
          reversalSourceType: 'SALES_RETURN_REVERSAL',
        }),
      );
      expect(result.status).toBe(SalesReturnStatus.REVERSED);
      expect(result.accountingPostingStatus).toBe(SalesReturnPostingStatus.REVERSED);
    });

    it('reversing an already-REVERSED return is an idempotent no-op: no transaction side-effects, no accounting call', async () => {
      const reverseMock = jest.fn();
      const { service } = buildServiceForReverse(buildReverseTx({}), {
        softReturn: returnRow({ status: SalesReturnStatus.REVERSED }),
        accountingJournal: makeAccountingJournal({ reverse: reverseMock }),
      });

      const result = await service.reverse(actor, returnId, {});

      expect(reverseMock).not.toHaveBeenCalled();
      expect(result.status).toBe(SalesReturnStatus.REVERSED);
    });

    it('never throws on accounting-reversal failure: reversal still commits, accountingPostingStatus stays POSTED', async () => {
      const tx = buildReverseTx({
        accountingPostingStatus: SalesReturnPostingStatus.POSTED,
        journalEntryId: 'je-1',
      });
      const reverseMock = jest.fn().mockRejectedValue(new Error('accounting service unreachable'));
      const { service } = buildServiceForReverse(tx, {
        softReturn: returnRow({
          status: SalesReturnStatus.CONFIRMED,
          accountingPostingStatus: SalesReturnPostingStatus.POSTED,
          journalEntryId: 'je-1',
        }),
        accountingJournal: makeAccountingJournal({ reverse: reverseMock }),
      });

      const result = await service.reverse(actor, returnId, {});

      expect(result.status).toBe(SalesReturnStatus.REVERSED);
      expect(result.accountingPostingStatus).toBe(SalesReturnPostingStatus.POSTED);
    });

    it('retryAccountingPosting() rejects a REVERSED return', async () => {
      const prisma: any = {
        salesReturn: { findFirst: jest.fn().mockResolvedValue(returnRow({ status: SalesReturnStatus.REVERSED })) },
      };
      const service = new SalesReturnsService(
        prisma as never,
        makeInventory() as never,
        makeAccountingJournal() as never,
        makeAudit() as never,
      );
      await expect(service.retryAccountingPosting(actor, returnId)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('retryAccountingReversal() rejects a return that is not yet REVERSED', async () => {
      const prisma: any = {
        salesReturn: { findFirst: jest.fn().mockResolvedValue(returnRow({ status: SalesReturnStatus.CONFIRMED })) },
      };
      const service = new SalesReturnsService(
        prisma as never,
        makeInventory() as never,
        makeAccountingJournal() as never,
        makeAudit() as never,
      );
      await expect(service.retryAccountingReversal(actor, returnId)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });
});
