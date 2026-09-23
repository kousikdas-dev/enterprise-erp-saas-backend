import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  PurchaseInvoicePaymentStatus,
  PurchaseInvoicePostingStatus,
  PurchaseInvoiceStatus,
  PurchaseOrderStatus,
  SupplierPaymentPostingStatus,
} from '../../generated/prisma-client';
import { AccountingJournalClient } from '../accounting/accounting-journal.client';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { PurchaseInvoicesService } from './purchase-invoices.service';

describe('PurchaseInvoicesService', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const actor = { userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', tenantId };
  const otherTenantId = 'zzzzzzzz-zzzz-4zzz-8zzz-zzzzzzzzzzzz';

  const poId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const poItemId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const poItemId2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const productId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const supplierId = '99999999-9999-4999-8999-999999999999';
  const grId = '88888888-8888-4888-8888-888888888888';
  const grItemId = '77777777-7777-4777-8777-777777777777';
  const grItemId2 = '66666666-6666-4666-8666-666666666666';
  const taxCodeId = '55555555-5555-4555-8555-555555555555';
  const invoiceId = '44444444-4444-4444-8444-444444444444';

  function decimal(v: string) {
    return new Prisma.Decimal(v);
  }

  function basePoItem(overrides: Record<string, unknown> = {}) {
    return {
      id: poItemId,
      tenantId,
      purchaseOrderId: poId,
      productId,
      productSku: 'SKU-1',
      productName: 'Widget',
      quantity: decimal('50'), // ordered
      unitOfMeasureId: null,
      uomCode: null,
      uomName: null,
      conversionFactor: null,
      unitCost: decimal('10'),
      discountPercent: decimal('0'),
      discountAmount: decimal('0'),
      taxCodeId: null,
      taxCode: null,
      taxCodeName: null,
      taxAmount: decimal('0'),
      lineSubtotal: decimal('500'),
      lineTotal: decimal('500'),
      receivedQuantity: decimal('20'),
      invoicedQuantity: decimal('0'),
      createdAt: new Date(),
      updatedAt: new Date(),
      taxComponents: [] as unknown[],
      ...overrides,
    };
  }

  function taxComponent(overrides: Record<string, unknown> = {}) {
    return {
      sequence: 1,
      type: 'GST',
      name: 'GST',
      rate: decimal('10'),
      ...overrides,
    };
  }

  function buildOrder(items: unknown[], overrides: Record<string, unknown> = {}) {
    return {
      id: poId,
      tenantId,
      supplierId,
      supplierName: 'Acme Supplies',
      supplierGstin: '22AAAAA0000A1Z5',
      supplierBillingAddress: '1 Bill St',
      paymentTermId: 'pt-1',
      status: PurchaseOrderStatus.PARTIALLY_RECEIVED,
      items,
      ...overrides,
    };
  }

  function grItemRow(overrides: Record<string, unknown> = {}) {
    return {
      id: grItemId,
      tenantId,
      purchaseOrderItemId: poItemId,
      productId,
      productSku: 'SKU-1-GR',
      productName: 'Widget (received)',
      unitOfMeasureId: null,
      uomCode: null,
      uomName: null,
      conversionFactor: null,
      goodsReceipt: { purchaseOrderId: poId },
      ...overrides,
    };
  }

  /** Full PurchaseInvoiceItem row shape, for confirm()/cancel() tx mocks whose
   * findFirstOrThrow/update results flow through toPurchaseInvoiceResponse(). */
  function fullInvoiceItem(overrides: Record<string, unknown> = {}) {
    return {
      id: 'pii-default',
      tenantId,
      purchaseInvoiceId: invoiceId,
      purchaseOrderItemId: poItemId,
      goodsReceiptItemId: null,
      productId,
      productSku: 'SKU-1',
      productName: 'Widget',
      unitOfMeasureId: null,
      uomCode: null,
      uomName: null,
      conversionFactor: null,
      quantity: decimal('1'),
      unitCost: decimal('10'),
      discountPercent: decimal('0'),
      discountAmount: decimal('0'),
      taxCodeId: null,
      taxCode: null,
      taxCodeName: null,
      taxAmount: decimal('0'),
      lineSubtotal: decimal('10'),
      lineTotal: decimal('10'),
      createdAt: new Date(),
      updatedAt: new Date(),
      taxComponents: [] as unknown[],
      ...overrides,
    };
  }

  /** Full PurchaseInvoice header fields, for confirm()/cancel() tx `.update()` mocks. */
  function fullInvoiceHeader(overrides: Record<string, unknown> = {}) {
    return {
      id: invoiceId,
      tenantId,
      invoiceNumber: 'PINV-00000001',
      supplierInvoiceNumber: null,
      purchaseOrderId: poId,
      supplierId,
      supplierName: 'Acme Supplies',
      supplierGstin: null,
      supplierBillingAddress: null,
      paymentTermId: null,
      invoiceDate: new Date(),
      dueDate: null,
      notes: null,
      subtotal: decimal('0'),
      discountTotal: decimal('0'),
      taxTotal: decimal('0'),
      total: decimal('0'),
      amountPaid: decimal('0'),
      paymentStatus: 'UNPAID',
      confirmedAt: null,
      accountingPostingStatus: PurchaseInvoicePostingStatus.NOT_POSTED,
      journalEntryId: null,
      reversalJournalEntryId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  /** Transforms the Prisma nested-create payload create() builds into a resolved "row" shape. */
  function rowFromCreateData(id: string, data: any) {
    return {
      id,
      tenantId: data.tenantId,
      invoiceNumber: data.invoiceNumber,
      supplierInvoiceNumber: data.supplierInvoiceNumber,
      purchaseOrderId: data.purchaseOrderId,
      status: data.status,
      supplierId: data.supplierId,
      supplierName: data.supplierName,
      supplierGstin: data.supplierGstin,
      supplierBillingAddress: data.supplierBillingAddress,
      paymentTermId: data.paymentTermId,
      invoiceDate: data.invoiceDate,
      dueDate: data.dueDate,
      notes: data.notes,
      subtotal: data.subtotal,
      discountTotal: data.discountTotal,
      taxTotal: data.taxTotal,
      total: data.total,
      amountPaid: decimal('0'),
      paymentStatus: 'UNPAID',
      confirmedAt: null,
      accountingPostingStatus: PurchaseInvoicePostingStatus.NOT_POSTED,
      journalEntryId: null,
      reversalJournalEntryId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: data.items.create.map((item: any, idx: number) => ({
        id: `item-${idx}`,
        tenantId: item.tenantId,
        purchaseInvoiceId: id,
        purchaseOrderItemId: item.purchaseOrderItemId,
        goodsReceiptItemId: item.goodsReceiptItemId,
        productId: item.productId,
        productSku: item.productSku,
        productName: item.productName,
        unitOfMeasureId: item.unitOfMeasureId,
        uomCode: item.uomCode,
        uomName: item.uomName,
        conversionFactor: item.conversionFactor,
        quantity: item.quantity,
        unitCost: item.unitCost,
        discountPercent: item.discountPercent,
        discountAmount: item.discountAmount,
        taxCodeId: item.taxCodeId,
        taxCode: item.taxCode,
        taxCodeName: item.taxCodeName,
        taxAmount: item.taxAmount,
        lineSubtotal: item.lineSubtotal,
        lineTotal: item.lineTotal,
        createdAt: new Date(),
        updatedAt: new Date(),
        taxComponents: item.taxComponents.create.map((c: any, cidx: number) => ({
          id: `tc-${idx}-${cidx}`,
          sequence: c.sequence,
          type: c.type,
          name: c.name,
          rate: c.rate,
          componentTaxAmount: c.componentTaxAmount,
        })),
      })),
    };
  }

  function buildCreatePrisma(options: {
    order: ReturnType<typeof buildOrder>;
    grItem?: unknown | null;
    otherDraftRows?: Array<{ purchaseOrderItemId: string; quantity: Prisma.Decimal }>;
    mismatchPoItems?: unknown[];
    count?: number;
  }) {
    let capturedCreateData: any;
    return {
      purchaseOrder: { findFirst: jest.fn().mockResolvedValue(options.order) },
      goodsReceiptItem: {
        findFirst: jest.fn().mockResolvedValue(options.grItem ?? null),
      },
      purchaseInvoiceItem: {
        findMany: jest.fn().mockResolvedValue(options.otherDraftRows ?? []),
      },
      purchaseInvoice: {
        count: jest.fn().mockResolvedValue(options.count ?? 0),
        create: jest.fn((args: { data: any }) => {
          capturedCreateData = args.data;
          return Promise.resolve(rowFromCreateData('created-invoice', args.data));
        }),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      purchaseOrderItem: {
        findMany: jest.fn().mockResolvedValue(options.mismatchPoItems ?? options.order.items),
      },
      get __createdData() {
        return capturedCreateData;
      },
    };
  }

  /**
   * Default accounting-journal client: both post() and reverse() succeed
   * immediately, matching the "accounting available and healthy" happy
   * path — so every pre-existing test that doesn't care about accounting
   * posting keeps working unmodified. Tests that specifically exercise
   * failure/idempotency/reversal pass their own accountingJournal override.
   */
  function buildAccountingJournalMock(
    overrides: Partial<{ post: jest.Mock; reverse: jest.Mock }> = {},
  ) {
    return {
      post:
        overrides.post ??
        jest.fn().mockResolvedValue({
          id: 'je-mock',
          entryNumber: 'JE-00000001',
          status: 'POSTED',
          sourceService: 'purchase-service',
          sourceType: 'PURCHASE_INVOICE',
          sourceId: 'mock',
          reversesJournalEntryId: null,
          idempotentReplay: false,
          totalDebit: '0.0000',
          totalCredit: '0.0000',
        }),
      reverse:
        overrides.reverse ??
        jest.fn().mockResolvedValue({
          id: 'je-reversal-mock',
          entryNumber: 'JE-00000002',
          status: 'POSTED',
          sourceService: 'purchase-service',
          sourceType: 'PURCHASE_INVOICE_CANCELLATION',
          sourceId: 'mock',
          reversesJournalEntryId: 'je-mock',
          idempotentReplay: false,
          totalDebit: '0.0000',
          totalCredit: '0.0000',
        }),
    };
  }

  /** Default outer (non-tx) purchaseInvoice mock used by the post-commit
   * accounting posting/reversal step — dynamically reflects whatever
   * `where`/`data` the call used, so existing per-test tx fixtures don't
   * each need their own copy. */
  function defaultOuterPurchaseInvoiceMock(status: PurchaseInvoiceStatus) {
    // Stateful across calls within one test: attemptInvoicePosting()'s
    // failure path calls update() (to record FAILED) and then, separately,
    // findFirst() via require() to fetch a fresh row for the response —
    // the latter must see what the former just wrote, or the returned
    // accountingPostingStatus would incorrectly appear unchanged.
    let latest: Record<string, unknown> = {};
    return {
      update: jest.fn(({ where, data }: any) => {
        latest = { ...latest, ...data };
        return Promise.resolve(
          fullInvoiceHeader({ id: where.id, status, items: [], ...latest }),
        );
      }),
      findFirst: jest.fn(({ where }: any) =>
        Promise.resolve(fullInvoiceHeader({ id: where.id, status, items: [], ...latest })),
      ),
    };
  }

  /** Default outer (non-tx) supplierPayment mock — same rationale as above. */
  function basePaymentFixture() {
    return {
      id: 'payment-1',
      tenantId,
      purchaseInvoiceId: invoiceId,
      amount: decimal('0'),
      paymentDate: new Date(),
      paymentMethodId: null,
      reference: null,
      notes: null,
      accountingPostingStatus: SupplierPaymentPostingStatus.NOT_POSTED,
      journalEntryId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  function defaultOuterSupplierPaymentMock() {
    const base = basePaymentFixture();
    return {
      update: jest.fn(({ where, data }: any) =>
        Promise.resolve({ ...base, id: where.id, ...data }),
      ),
      findFirstOrThrow: jest.fn(({ where }: any) =>
        Promise.resolve({ ...base, id: where.id }),
      ),
    };
  }

  function buildService(prisma: unknown, accountingJournal?: unknown) {
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new PurchaseInvoicesService(
      prisma as never,
      audit as unknown as IdentityAuditClient,
      (accountingJournal ??
        buildAccountingJournalMock()) as unknown as AccountingJournalClient,
    );
    return { service, audit };
  }

  /** tx mock for confirm(): $queryRaw x3 (x5 when matched inventory lines are
   * present), findFirstOrThrow, PO items, updates. */
  function buildConfirmTx(options: {
    invoiceId: string;
    purchaseOrderId: string;
    initialStatus: PurchaseInvoiceStatus;
    invoiceItems: Array<{
      id: string;
      purchaseOrderItemId: string;
      quantity: Prisma.Decimal;
      productTracksInventory?: boolean | null;
      goodsReceiptItemId?: string | null;
      conversionFactor?: Prisma.Decimal | null;
      lineSubtotal?: Prisma.Decimal;
      goodsReceiptItem?: { unitCost: Prisma.Decimal | null; baseQuantity: Prisma.Decimal | null } | null;
    }>;
    poItems: Array<{
      id: string;
      quantity: Prisma.Decimal;
      receivedQuantity: Prisma.Decimal;
      invoicedQuantity: Prisma.Decimal;
    }>;
    otherDraftRows?: Array<{ purchaseOrderItemId: string; quantity: Prisma.Decimal }>;
    // Phase 3.2 (GRNI Clearing / PPV) fixtures — only consulted when at
    // least one invoiceItem has productTracksInventory === true.
    grItemRows?: Array<{
      id: string;
      goodsReceiptId: string;
      baseQuantity: Prisma.Decimal | null;
      unitCost: Prisma.Decimal | null;
    }>;
    receipts?: Array<{ id: string; status: string; accountingPostingStatus: string }>;
    matchRows?: Array<{
      id: string;
      goodsReceiptItemId: string;
      matchedQuantity: Prisma.Decimal;
      returnedQuantity: Prisma.Decimal;
    }>;
    // Header fields for the invoice row returned post-confirm — only
    // consulted by buildInvoicePostingRequest (taxTotal/total). Defaults to
    // fullInvoiceHeader()'s zeroed fields, which is fine for tests that
    // don't inspect what was actually sent to accountingJournal.post().
    header?: Record<string, unknown>;
  }) {
    const queryRawCalls: unknown[][] = [];
    const poItemUpdateCalls: Array<{ where: { id: string }; data: { invoicedQuantity: Prisma.Decimal } }> = [];
    const matchUpdateCalls: Array<{ where: { id: string }; data: { matchedQuantity: Prisma.Decimal } }> = [];
    const matchUpsertCalls: unknown[] = [];
    return {
      $queryRaw: jest.fn((...args: unknown[]) => {
        queryRawCalls.push(args);
        const n = queryRawCalls.length;
        if (n === 1) {
          return Promise.resolve([
            {
              id: options.invoiceId,
              status: options.initialStatus,
              purchaseOrderId: options.purchaseOrderId,
            },
          ]);
        }
        if (n === 2 || n === 3) {
          return Promise.resolve([{ id: 'lock-row' }]);
        }
        if (n === 4) {
          // goods_receipt_items lock query
          return Promise.resolve(options.grItemRows ?? []);
        }
        if (n === 5) {
          // purchase_invoice_goods_receipt_matches lock query
          return Promise.resolve(options.matchRows ?? []);
        }
        return Promise.resolve([{ id: 'lock-row' }]);
      }),
      purchaseInvoice: {
        findFirstOrThrow: jest.fn().mockResolvedValue({
          id: options.invoiceId,
          purchaseOrderId: options.purchaseOrderId,
          items: options.invoiceItems,
        }),
        update: jest.fn().mockResolvedValue(
          fullInvoiceHeader({
            id: options.invoiceId,
            purchaseOrderId: options.purchaseOrderId,
            status: PurchaseInvoiceStatus.CONFIRMED,
            items: options.invoiceItems,
            ...options.header,
          }),
        ),
      },
      purchaseOrderItem: {
        findMany: jest.fn().mockResolvedValue(options.poItems),
        update: jest.fn((args: { where: { id: string }; data: { invoicedQuantity: Prisma.Decimal } }) => {
          poItemUpdateCalls.push(args);
          return Promise.resolve(args);
        }),
      },
      purchaseInvoiceItem: {
        findMany: jest.fn().mockResolvedValue(options.otherDraftRows ?? []),
      },
      goodsReceipt: {
        findMany: jest.fn().mockResolvedValue(options.receipts ?? []),
      },
      purchaseInvoiceGoodsReceiptMatch: {
        upsert: jest.fn((args: unknown) => {
          matchUpsertCalls.push(args);
          return Promise.resolve({});
        }),
        update: jest.fn(
          (args: { where: { id: string }; data: { matchedQuantity: Prisma.Decimal } }) => {
            matchUpdateCalls.push(args);
            return Promise.resolve(args);
          },
        ),
      },
      __queryRawCalls: queryRawCalls,
      __poItemUpdateCalls: poItemUpdateCalls,
      __matchUpdateCalls: matchUpdateCalls,
      __matchUpsertCalls: matchUpsertCalls,
    };
  }

  function buildServiceForConfirm(
    tx: ReturnType<typeof buildConfirmTx>,
    outerMismatchPoItems: unknown[] = [],
    options: {
      accountingJournal?: unknown;
      purchaseInvoice?: Partial<Record<string, jest.Mock>>;
    } = {},
  ) {
    const prisma = {
      $transaction: jest.fn(async (fn: (c: unknown) => Promise<unknown>) => fn(tx)),
      purchaseOrderItem: { findMany: jest.fn().mockResolvedValue(outerMismatchPoItems) },
      purchaseInvoice: {
        ...defaultOuterPurchaseInvoiceMock(PurchaseInvoiceStatus.CONFIRMED),
        ...options.purchaseInvoice,
      },
    };
    return buildService(prisma, options.accountingJournal);
  }

  /** tx mock for cancel(): $queryRaw, findFirstOrThrow, (optionally) PO lock/items, update. */
  function buildCancelTx(options: {
    invoiceId: string;
    purchaseOrderId: string;
    status: PurchaseInvoiceStatus;
    amountPaid?: Prisma.Decimal;
    invoiceItems: Array<{ id: string; purchaseOrderItemId: string; quantity: Prisma.Decimal }>;
    poItems?: Array<{
      id: string;
      invoicedQuantity: Prisma.Decimal;
    }>;
    accountingPostingStatus?: PurchaseInvoicePostingStatus;
    journalEntryId?: string | null;
  }) {
    const poItemUpdateCalls: Array<{ where: { id: string }; data: { invoicedQuantity: Prisma.Decimal } }> = [];
    return {
      $queryRaw: jest.fn().mockResolvedValue([{ id: options.invoiceId }]),
      purchaseInvoice: {
        findFirstOrThrow: jest.fn().mockResolvedValue({
          id: options.invoiceId,
          purchaseOrderId: options.purchaseOrderId,
          status: options.status,
          amountPaid: options.amountPaid ?? decimal('0'),
          items: options.invoiceItems,
        }),
        update: jest.fn().mockResolvedValue(
          fullInvoiceHeader({
            id: options.invoiceId,
            purchaseOrderId: options.purchaseOrderId,
            status: PurchaseInvoiceStatus.CANCELLED,
            items: options.invoiceItems,
            accountingPostingStatus:
              options.accountingPostingStatus ?? PurchaseInvoicePostingStatus.NOT_POSTED,
            journalEntryId: options.journalEntryId ?? null,
          }),
        ),
      },
      purchaseOrderItem: {
        findMany: jest.fn().mockResolvedValue(options.poItems ?? []),
        update: jest.fn((args: { where: { id: string }; data: { invoicedQuantity: Prisma.Decimal } }) => {
          poItemUpdateCalls.push(args);
          return Promise.resolve(args);
        }),
      },
      __poItemUpdateCalls: poItemUpdateCalls,
    };
  }

  function buildServiceForCancel(
    tx: ReturnType<typeof buildCancelTx>,
    options: {
      accountingJournal?: unknown;
      purchaseInvoice?: Partial<Record<string, jest.Mock>>;
    } = {},
  ) {
    const prisma = {
      $transaction: jest.fn(async (fn: (c: unknown) => Promise<unknown>) => fn(tx)),
      purchaseOrderItem: { findMany: jest.fn().mockResolvedValue([]) },
      purchaseInvoice: {
        ...defaultOuterPurchaseInvoiceMock(PurchaseInvoiceStatus.CANCELLED),
        ...options.purchaseInvoice,
      },
    };
    return buildService(prisma, options.accountingJournal);
  }

  // ============================== CREATE ==================================

  it('1. creates a DRAFT invoice against a valid PO/GR', async () => {
    const order = buildOrder([basePoItem()]);
    const prisma = buildCreatePrisma({ order, grItem: grItemRow() });
    const { service } = buildService(prisma);

    const result = await service.create(actor, {
      purchaseOrderId: poId,
      items: [{ purchaseOrderItemId: poItemId, goodsReceiptItemId: grItemId, quantity: '5', unitCost: '10' }],
    });

    expect(result.status).toBe('DRAFT');
    expect(result.items[0].quantity).toBe('5.000000');
    expect(prisma.purchaseOrderItem.findMany).toHaveBeenCalled(); // no PO item write on create — read-only for mismatch info
  });

  it('2. invoicedQuantity is untouched at DRAFT creation — only committed at CONFIRM', async () => {
    const order = buildOrder([basePoItem({ invoicedQuantity: decimal('0') })]);
    const prisma = buildCreatePrisma({ order });
    const { service } = buildService(prisma);

    await service.create(actor, {
      purchaseOrderId: poId,
      items: [{ purchaseOrderItemId: poItemId, quantity: '5', unitCost: '10' }],
    });

    // create() never calls purchaseOrderItem.update — only confirm()/cancel() do.
    expect((prisma as any).purchaseOrderItem.update).toBeUndefined();
  });

  it('3. multiple lines under one invoice, each tied to a different GR item', async () => {
    const order = buildOrder([basePoItem({ receivedQuantity: decimal('20') })]);
    const grLookup: Record<string, unknown> = {
      [grItemId]: grItemRow({ id: grItemId }),
      [grItemId2]: grItemRow({ id: grItemId2 }),
    };
    const prisma = buildCreatePrisma({ order });
    prisma.goodsReceiptItem.findFirst = jest.fn(({ where }: any) =>
      Promise.resolve(grLookup[where.id] ?? null),
    ) as never;
    const { service } = buildService(prisma);

    const result = await service.create(actor, {
      purchaseOrderId: poId,
      items: [
        { purchaseOrderItemId: poItemId, goodsReceiptItemId: grItemId, quantity: '4', unitCost: '10' },
        { purchaseOrderItemId: poItemId, goodsReceiptItemId: grItemId2, quantity: '3', unitCost: '10' },
      ],
    });

    expect(result.items).toHaveLength(2);
    expect(result.items[0].goodsReceiptItemId).toBe(grItemId);
    expect(result.items[1].goodsReceiptItemId).toBe(grItemId2);
  });

  it('4. rejects DRAFT creation once the line quantity exceeds remaining received quantity', async () => {
    const order = buildOrder([
      basePoItem({ receivedQuantity: decimal('5'), invoicedQuantity: decimal('0') }),
    ]);
    const prisma = buildCreatePrisma({ order });
    const { service } = buildService(prisma);

    await expect(
      service.create(actor, {
        purchaseOrderId: poId,
        items: [{ purchaseOrderItemId: poItemId, quantity: '6', unitCost: '10' }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('5. rejects once the line quantity exceeds remaining ORDERED quantity (defense-in-depth)', async () => {
    // receivedQuantity is generously large, but orderedQuantity itself is tight.
    const order = buildOrder([
      basePoItem({ quantity: decimal('5'), receivedQuantity: decimal('100'), invoicedQuantity: decimal('0') }),
    ]);
    const prisma = buildCreatePrisma({ order });
    const { service } = buildService(prisma);

    await expect(
      service.create(actor, {
        purchaseOrderId: poId,
        items: [{ purchaseOrderItemId: poItemId, quantity: '6', unitCost: '10' }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('8. two lines in one invoice against the same PO item (different GR items) sum correctly against the bound', async () => {
    const order = buildOrder([
      basePoItem({ receivedQuantity: decimal('7'), invoicedQuantity: decimal('0') }),
    ]);
    const grLookup: Record<string, unknown> = {
      [grItemId]: grItemRow({ id: grItemId }),
      [grItemId2]: grItemRow({ id: grItemId2 }),
    };
    const prisma = buildCreatePrisma({ order });
    prisma.goodsReceiptItem.findFirst = jest.fn(({ where }: any) =>
      Promise.resolve(grLookup[where.id] ?? null),
    ) as never;
    const { service } = buildService(prisma);

    // 4 + 3 = 7, exactly at the bound — should succeed.
    const ok = await service.create(actor, {
      purchaseOrderId: poId,
      items: [
        { purchaseOrderItemId: poItemId, goodsReceiptItemId: grItemId, quantity: '4', unitCost: '10' },
        { purchaseOrderItemId: poItemId, goodsReceiptItemId: grItemId2, quantity: '3', unitCost: '10' },
      ],
    });
    expect(ok.items).toHaveLength(2);

    // 4 + 4 = 8 > 7 — must be rejected, proving accumulation (not independent per-line checks).
    await expect(
      service.create(actor, {
        purchaseOrderId: poId,
        items: [
          { purchaseOrderItemId: poItemId, goodsReceiptItemId: grItemId, quantity: '4', unitCost: '10' },
          { purchaseOrderItemId: poItemId, goodsReceiptItemId: grItemId2, quantity: '4', unitCost: '10' },
        ],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('9. rejects an exact duplicate (purchaseOrderItemId, goodsReceiptItemId) pair within one DTO', async () => {
    const order = buildOrder([basePoItem()]);
    const prisma = buildCreatePrisma({ order, grItem: grItemRow() });
    const { service } = buildService(prisma);

    await expect(
      service.create(actor, {
        purchaseOrderId: poId,
        items: [
          { purchaseOrderItemId: poItemId, goodsReceiptItemId: grItemId, quantity: '2', unitCost: '10' },
          { purchaseOrderItemId: poItemId, goodsReceiptItemId: grItemId, quantity: '2', unitCost: '10' },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('9b. does NOT reject the same purchaseOrderItemId when no goodsReceiptItemId is supplied on either line — real duplicate, not a GR-differentiated pair', async () => {
    // Both lines share the key "poItemId|" (no GR ref) -> genuine duplicate, rejected.
    const order = buildOrder([basePoItem({ receivedQuantity: decimal('10') })]);
    const prisma = buildCreatePrisma({ order });
    const { service } = buildService(prisma);

    await expect(
      service.create(actor, {
        purchaseOrderId: poId,
        items: [
          { purchaseOrderItemId: poItemId, quantity: '2', unitCost: '10' },
          { purchaseOrderItemId: poItemId, quantity: '2', unitCost: '10' },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('10a. rejects a purchaseOrderItemId from another PO', async () => {
    const order = buildOrder([basePoItem()]); // only contains poItemId
    const prisma = buildCreatePrisma({ order });
    const { service } = buildService(prisma);

    await expect(
      service.create(actor, {
        purchaseOrderId: poId,
        items: [{ purchaseOrderItemId: poItemId2, quantity: '1', unitCost: '10' }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('10b. rejects a purchaseOrderItemId belonging to another tenant', async () => {
    const order = buildOrder([basePoItem({ tenantId: otherTenantId })]);
    const prisma = buildCreatePrisma({ order });
    const { service } = buildService(prisma);

    await expect(
      service.create(actor, {
        purchaseOrderId: poId,
        items: [{ purchaseOrderItemId: poItemId, quantity: '1', unitCost: '10' }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('10c. rejects a goodsReceiptItemId from another tenant (404)', async () => {
    const order = buildOrder([basePoItem()]);
    const prisma = buildCreatePrisma({ order, grItem: null }); // tenant-scoped lookup finds nothing
    const { service } = buildService(prisma);

    await expect(
      service.create(actor, {
        purchaseOrderId: poId,
        items: [{ purchaseOrderItemId: poItemId, goodsReceiptItemId: grItemId, quantity: '1', unitCost: '10' }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('10d. rejects a goodsReceiptItemId whose GR belongs to a different purchase order (400)', async () => {
    const order = buildOrder([basePoItem()]);
    const prisma = buildCreatePrisma({
      order,
      grItem: grItemRow({ goodsReceipt: { purchaseOrderId: 'some-other-po' } }),
    });
    const { service } = buildService(prisma);

    await expect(
      service.create(actor, {
        purchaseOrderId: poId,
        items: [{ purchaseOrderItemId: poItemId, goodsReceiptItemId: grItemId, quantity: '1', unitCost: '10' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('10e. rejects a goodsReceiptItemId whose own purchaseOrderItemId does not match the invoice line (400)', async () => {
    const order = buildOrder([basePoItem()]);
    const prisma = buildCreatePrisma({
      order,
      grItem: grItemRow({ purchaseOrderItemId: poItemId2 }), // mismatched
    });
    const { service } = buildService(prisma);

    await expect(
      service.create(actor, {
        purchaseOrderId: poId,
        items: [{ purchaseOrderItemId: poItemId, goodsReceiptItemId: grItemId, quantity: '1', unitCost: '10' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('11. preserves the product/UOM/supplier snapshot copied at creation time', async () => {
    const order = buildOrder([
      basePoItem({
        unitOfMeasureId: 'uom-1',
        uomCode: 'BOX',
        uomName: 'Box',
        conversionFactor: decimal('10'),
      }),
    ]);
    const prisma = buildCreatePrisma({ order }); // no GR item -> falls back to PO item snapshot
    const { service } = buildService(prisma);

    const result = await service.create(actor, {
      purchaseOrderId: poId,
      items: [{ purchaseOrderItemId: poItemId, quantity: '2', unitCost: '10' }],
    });

    expect(result.supplierName).toBe('Acme Supplies');
    expect(result.supplierGstin).toBe('22AAAAA0000A1Z5');
    expect(result.items[0].productSku).toBe('SKU-1');
    expect(result.items[0].uomCode).toBe('BOX');
    expect(result.items[0].conversionFactor).toBe('10.000000');
  });

  it('12. never re-fetches product/UOM/supplier from any live source — only the loaded PO/GR rows are ever read', async () => {
    const order = buildOrder([basePoItem()]);
    const prisma = buildCreatePrisma({ order });
    const { service } = buildService(prisma);

    await service.create(actor, {
      purchaseOrderId: poId,
      items: [{ purchaseOrderItemId: poItemId, quantity: '2', unitCost: '10' }],
    });

    // The only reads performed are purchaseOrder.findFirst (once, in create())
    // and the mismatch-lookup purchaseOrderItem.findMany — no Supplier,
    // Product, or master-data client of any kind exists on this service.
    expect(prisma.purchaseOrder.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.goodsReceiptItem.findFirst).not.toHaveBeenCalled();
  });

  it('13. cost mismatch is flagged (zero tolerance) when the invoice unitCost differs from the PO line', async () => {
    const order = buildOrder([basePoItem({ unitCost: decimal('10') })]);
    const prisma = buildCreatePrisma({ order, mismatchPoItems: order.items });
    const { service } = buildService(prisma);

    const result = await service.create(actor, {
      purchaseOrderId: poId,
      items: [{ purchaseOrderItemId: poItemId, quantity: '2', unitCost: '12' }],
    });

    expect(result.items[0].costMismatch).toBe(true);
  });

  it('14. tax mismatch flag is present and false when tax is copied forward from the PO line (no re-resolution)', async () => {
    const poItem = basePoItem({
      taxCodeId,
      taxCode: 'GST10',
      taxCodeName: 'GST 10%',
      taxComponents: [taxComponent()],
    });
    const order = buildOrder([poItem]);
    const prisma = buildCreatePrisma({ order, mismatchPoItems: order.items });
    const { service } = buildService(prisma);

    const result = await service.create(actor, {
      purchaseOrderId: poId,
      items: [{ purchaseOrderItemId: poItemId, quantity: '2', unitCost: '10' }],
    });

    expect(result.items[0].taxCodeId).toBe(taxCodeId);
    expect(result.items[0].taxMismatch).toBe(false);
  });

  it('15. discount mismatch is flagged when the invoice discountPercent differs from the PO line', async () => {
    const order = buildOrder([basePoItem({ discountPercent: decimal('0') })]);
    const prisma = buildCreatePrisma({ order, mismatchPoItems: order.items });
    const { service } = buildService(prisma);

    const result = await service.create(actor, {
      purchaseOrderId: poId,
      items: [{ purchaseOrderItemId: poItemId, quantity: '2', unitCost: '10', discountPercent: '5' }],
    });

    expect(result.items[0].discountMismatch).toBe(true);
  });

  it('16. server-authoritative calculation: gross -> discount -> subtotal -> tax -> total, 4-decimal HALF_UP', async () => {
    const poItem = basePoItem({
      taxCodeId,
      taxCode: 'GST10',
      taxComponents: [taxComponent({ rate: decimal('10') })],
    });
    const order = buildOrder([poItem]);
    const prisma = buildCreatePrisma({ order });
    const { service } = buildService(prisma);

    // quantity 3 x unitCost 10 = gross 30; discount 10% = 3; lineSubtotal 27; tax 10% of 27 = 2.7; lineTotal 29.7
    const result = await service.create(actor, {
      purchaseOrderId: poId,
      items: [{ purchaseOrderItemId: poItemId, quantity: '3', unitCost: '10', discountPercent: '10' }],
    });

    expect(result.items[0].lineSubtotal).toBe('27.0000');
    expect(result.items[0].taxAmount).toBe('2.7000');
    expect(result.items[0].lineTotal).toBe('29.7000');
    expect(result.subtotal).toBe('30.0000');
    expect(result.discountTotal).toBe('3.0000');
    expect(result.taxTotal).toBe('2.7000');
    expect(result.total).toBe('29.7000');
  });

  it('18. tax component rows are persisted per-component, mirroring the PO line rate structure', async () => {
    const poItem = basePoItem({
      taxCodeId,
      taxCode: 'GST',
      taxComponents: [
        taxComponent({ sequence: 1, type: 'CGST', rate: decimal('5') }),
        taxComponent({ sequence: 2, type: 'SGST', rate: decimal('5') }),
      ],
    });
    const order = buildOrder([poItem]);
    const prisma = buildCreatePrisma({ order });
    const { service } = buildService(prisma);

    const result = await service.create(actor, {
      purchaseOrderId: poId,
      items: [{ purchaseOrderItemId: poItemId, quantity: '10', unitCost: '10' }],
    });

    expect(result.items[0].taxComponents).toHaveLength(2);
    expect(result.items[0].taxComponents[0].componentTaxAmount).toBe('5.0000');
    expect(result.items[0].taxComponents[1].componentTaxAmount).toBe('5.0000');
    expect(result.items[0].taxAmount).toBe('10.0000');
  });

  it('19. a new DRAFT invoice defaults amountPaid=0 / paymentStatus=UNPAID', async () => {
    const order = buildOrder([basePoItem()]);
    const prisma = buildCreatePrisma({ order });
    const { service } = buildService(prisma);

    const result = await service.create(actor, {
      purchaseOrderId: poId,
      items: [{ purchaseOrderItemId: poItemId, quantity: '2', unitCost: '10' }],
    });

    expect(result.amountPaid).toBe('0.0000');
    expect(result.paymentStatus).toBe('UNPAID');
    expect(result.balanceDue).toBe(result.total);
  });

  it('rejects invoicing against a DRAFT purchase order (not yet receivable)', async () => {
    const order = buildOrder([basePoItem()], { status: PurchaseOrderStatus.DRAFT });
    const prisma = buildCreatePrisma({ order });
    const { service } = buildService(prisma);

    await expect(
      service.create(actor, {
        purchaseOrderId: poId,
        items: [{ purchaseOrderItemId: poItemId, quantity: '1', unitCost: '10' }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  // ============================== DRAFT editing / lifecycle ===============

  it('15-draft. update() replaces the line set while DRAFT and never touches invoicedQuantity', async () => {
    const order = buildOrder([basePoItem()]);
    const prisma = buildCreatePrisma({ order });
    const purchaseInvoiceUpdate = jest.fn().mockResolvedValue(
      rowFromCreateData(invoiceId, {
        tenantId,
        invoiceNumber: 'PINV-00000001',
        supplierInvoiceNumber: null,
        purchaseOrderId: poId,
        status: PurchaseInvoiceStatus.DRAFT,
        supplierId,
        supplierName: 'Acme Supplies',
        supplierGstin: null,
        supplierBillingAddress: null,
        paymentTermId: null,
        invoiceDate: new Date(),
        dueDate: null,
        notes: null,
        subtotal: decimal('30'),
        discountTotal: decimal('0'),
        taxTotal: decimal('0'),
        total: decimal('30'),
        items: {
          create: [
            {
              tenantId,
              purchaseOrderItemId: poItemId,
              goodsReceiptItemId: null,
              productId,
              productSku: 'SKU-1',
              productName: 'Widget',
              unitOfMeasureId: null,
              uomCode: null,
              uomName: null,
              conversionFactor: null,
              quantity: decimal('3'),
              unitCost: decimal('10'),
              discountPercent: decimal('0'),
              discountAmount: decimal('0'),
              taxCodeId: null,
              taxCode: null,
              taxCodeName: null,
              taxAmount: decimal('0'),
              lineSubtotal: decimal('30'),
              lineTotal: decimal('30'),
              taxComponents: { create: [] },
            },
          ],
        },
      }),
    );
    const existingInvoice = {
      id: invoiceId,
      tenantId,
      purchaseOrderId: poId,
      status: PurchaseInvoiceStatus.DRAFT,
      items: [],
    };
    (prisma.purchaseInvoice as any).findFirst = jest.fn().mockResolvedValue(existingInvoice);
    const tx = {
      purchaseInvoiceItem: { deleteMany: jest.fn(), create: jest.fn() },
      purchaseInvoice: { update: purchaseInvoiceUpdate },
    };
    (prisma as any).$transaction = jest.fn(async (fn: (c: unknown) => Promise<unknown>) => fn(tx));
    const { service } = buildService(prisma);

    const result = await service.update(actor, invoiceId, {
      items: [{ purchaseOrderItemId: poItemId, quantity: '3', unitCost: '10' }],
    });

    expect(result.status).toBe('DRAFT');
    expect(tx.purchaseInvoiceItem.deleteMany).toHaveBeenCalled();
    // No PO-item write anywhere in update() — invoicedQuantity untouched.
    expect((prisma as any).purchaseOrderItem.update).toBeUndefined();
  });

  it('16-draft. update() on a CONFIRMED invoice is rejected (editing locks after confirmation)', async () => {
    const prisma: any = {
      purchaseInvoice: {
        findFirst: jest.fn().mockResolvedValue({
          id: invoiceId,
          tenantId,
          purchaseOrderId: poId,
          status: PurchaseInvoiceStatus.CONFIRMED,
          items: [],
        }),
      },
    };
    const { service } = buildService(prisma);

    await expect(
      service.update(actor, invoiceId, { notes: 'x' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  // ============================== CONFIRM ==================================

  it('confirms a DRAFT invoice, committing invoicedQuantity (aggregated across this invoice\'s lines)', async () => {
    const invoiceItems = [
      fullInvoiceItem({ id: 'pii1', purchaseOrderItemId: poItemId, quantity: decimal('4') }),
    ];
    const poItems = [
      { id: poItemId, quantity: decimal('50'), receivedQuantity: decimal('20'), invoicedQuantity: decimal('0') },
    ];
    const tx = buildConfirmTx({
      invoiceId,
      purchaseOrderId: poId,
      initialStatus: PurchaseInvoiceStatus.DRAFT,
      invoiceItems,
      poItems,
    });
    const { service } = buildServiceForConfirm(tx);

    const result = await service.confirm(actor, invoiceId);

    expect(result.status).toBe('CONFIRMED');
    expect(tx.__poItemUpdateCalls).toHaveLength(1);
    expect(tx.__poItemUpdateCalls[0].data.invoicedQuantity.toFixed(0)).toBe('4');
  });

  it('confirm() rejects once committed invoicedQuantity + this exceeds receivedQuantity', async () => {
    const invoiceItems = [fullInvoiceItem({ id: 'pii1', purchaseOrderItemId: poItemId, quantity: decimal('6') })];
    const poItems = [
      { id: poItemId, quantity: decimal('50'), receivedQuantity: decimal('10'), invoicedQuantity: decimal('5') },
    ];
    const tx = buildConfirmTx({
      invoiceId, purchaseOrderId: poId, initialStatus: PurchaseInvoiceStatus.DRAFT, invoiceItems, poItems,
    });
    const { service } = buildServiceForConfirm(tx);

    await expect(service.confirm(actor, invoiceId)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.__poItemUpdateCalls).toHaveLength(0);
  });

  it('confirm() rejects once committed invoicedQuantity + this exceeds orderedQuantity (defense-in-depth)', async () => {
    const invoiceItems = [fullInvoiceItem({ id: 'pii1', purchaseOrderItemId: poItemId, quantity: decimal('6') })];
    const poItems = [
      { id: poItemId, quantity: decimal('8'), receivedQuantity: decimal('100'), invoicedQuantity: decimal('5') },
    ];
    const tx = buildConfirmTx({
      invoiceId, purchaseOrderId: poId, initialStatus: PurchaseInvoiceStatus.DRAFT, invoiceItems, poItems,
    });
    const { service } = buildServiceForConfirm(tx);

    await expect(service.confirm(actor, invoiceId)).rejects.toBeInstanceOf(ConflictException);
  });

  it('6. two sequential confirm() calls for two separate DRAFT invoices on the same PO item: second correctly bounded by the first\'s committed update', async () => {
    const poItemsShared = { id: poItemId, quantity: decimal('50'), receivedQuantity: decimal('10'), invoicedQuantity: decimal('0') };

    const txA = buildConfirmTx({
      invoiceId: 'inv-a',
      purchaseOrderId: poId,
      initialStatus: PurchaseInvoiceStatus.DRAFT,
      invoiceItems: [fullInvoiceItem({ id: 'pii-a', purchaseOrderItemId: poItemId, quantity: decimal('6') })],
      poItems: [{ ...poItemsShared }],
    });
    const { service: serviceA } = buildServiceForConfirm(txA);
    await serviceA.confirm(actor, 'inv-a');
    expect(txA.__poItemUpdateCalls[0].data.invoicedQuantity.toFixed(0)).toBe('6');

    // Simulate the committed state after invoice A: invoicedQuantity is now 6.
    const txB = buildConfirmTx({
      invoiceId: 'inv-b',
      purchaseOrderId: poId,
      initialStatus: PurchaseInvoiceStatus.DRAFT,
      invoiceItems: [fullInvoiceItem({ id: 'pii-b', purchaseOrderItemId: poItemId, quantity: decimal('6') })],
      poItems: [{ id: poItemId, quantity: decimal('50'), receivedQuantity: decimal('10'), invoicedQuantity: decimal('6') }],
    });
    const { service: serviceB } = buildServiceForConfirm(txB);

    // 6 (committed) + 6 (this) = 12 > 10 (received) -> rejected.
    await expect(serviceB.confirm(actor, 'inv-b')).rejects.toBeInstanceOf(ConflictException);
  });

  it('7. confirm() rejects purely because another still-DRAFT invoice\'s quantity would push the total past receivedQuantity', async () => {
    // Invoice A (being confirmed) quantity=6 alone fits within receivedQuantity=10.
    // Invoice B, still DRAFT, quantity=7 for the same PO item.
    // 0 (committed) + 7 (other DRAFT) + 6 (this) = 13 > 10 -> rejected, even
    // though invoice A alone would have fit.
    const invoiceItems = [fullInvoiceItem({ id: 'pii-a', purchaseOrderItemId: poItemId, quantity: decimal('6') })];
    const poItems = [{ id: poItemId, quantity: decimal('50'), receivedQuantity: decimal('10'), invoicedQuantity: decimal('0') }];
    const tx = buildConfirmTx({
      invoiceId,
      purchaseOrderId: poId,
      initialStatus: PurchaseInvoiceStatus.DRAFT,
      invoiceItems,
      poItems,
      otherDraftRows: [{ purchaseOrderItemId: poItemId, quantity: decimal('7') }],
    });
    const { service } = buildServiceForConfirm(tx);

    await expect(service.confirm(actor, invoiceId)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.__poItemUpdateCalls).toHaveLength(0);
  });

  it('confirms a two-line invoice against the same PO item, aggregating before the single PO-item update', async () => {
    const invoiceItems = [
      fullInvoiceItem({ id: 'pii1', purchaseOrderItemId: poItemId, quantity: decimal('4') }),
      fullInvoiceItem({ id: 'pii2', purchaseOrderItemId: poItemId, quantity: decimal('3') }),
    ];
    const poItems = [
      { id: poItemId, quantity: decimal('50'), receivedQuantity: decimal('20'), invoicedQuantity: decimal('0') },
    ];
    const tx = buildConfirmTx({
      invoiceId, purchaseOrderId: poId, initialStatus: PurchaseInvoiceStatus.DRAFT, invoiceItems, poItems,
    });
    const { service } = buildServiceForConfirm(tx);

    await service.confirm(actor, invoiceId);

    expect(tx.__poItemUpdateCalls).toHaveLength(1); // ONE update, not two
    expect(tx.__poItemUpdateCalls[0].data.invoicedQuantity.toFixed(0)).toBe('7');
  });

  it('confirm() rejects a non-DRAFT invoice (already CONFIRMED)', async () => {
    const tx = buildConfirmTx({
      invoiceId,
      purchaseOrderId: poId,
      initialStatus: PurchaseInvoiceStatus.CONFIRMED,
      invoiceItems: [],
      poItems: [],
    });
    const { service } = buildServiceForConfirm(tx);

    await expect(service.confirm(actor, invoiceId)).rejects.toBeInstanceOf(ConflictException);
  });

  it('confirm() rejects an empty invoice (no items)', async () => {
    const tx = buildConfirmTx({
      invoiceId,
      purchaseOrderId: poId,
      initialStatus: PurchaseInvoiceStatus.DRAFT,
      invoiceItems: [],
      poItems: [],
    });
    const { service } = buildServiceForConfirm(tx);

    await expect(service.confirm(actor, invoiceId)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('14. locks purchase_invoices -> purchase_orders -> purchase_order_items, in that order, inside confirm()', async () => {
    const invoiceItems = [fullInvoiceItem({ id: 'pii1', purchaseOrderItemId: poItemId, quantity: decimal('4') })];
    const poItems = [{ id: poItemId, quantity: decimal('50'), receivedQuantity: decimal('20'), invoicedQuantity: decimal('0') }];
    const tx = buildConfirmTx({
      invoiceId, purchaseOrderId: poId, initialStatus: PurchaseInvoiceStatus.DRAFT, invoiceItems, poItems,
    });
    const { service } = buildServiceForConfirm(tx);

    await service.confirm(actor, invoiceId);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    function sqlText(args: unknown[]): string {
      const first = args[0] as { sql?: string } | string[];
      if (first && typeof first === 'object' && 'sql' in first && first.sql) return first.sql;
      if (Array.isArray(first)) return first.join(' ');
      return String(first);
    }
    const [first, second, third] = tx.__queryRawCalls.map(sqlText);
    expect(first).toContain('purchase_invoices');
    expect(first).not.toContain('purchase_orders');
    expect(second).toContain('purchase_orders');
    expect(second).not.toContain('purchase_order_items');
    expect(third).toContain('purchase_order_items');
  });

  // ============================== CANCEL ====================================

  it('19-cancel. cancels a DRAFT invoice: invoicedQuantity untouched, no PO/PO-item query at all', async () => {
    const tx = buildCancelTx({
      invoiceId,
      purchaseOrderId: poId,
      status: PurchaseInvoiceStatus.DRAFT,
      invoiceItems: [fullInvoiceItem({ id: 'pii1', purchaseOrderItemId: poItemId, quantity: decimal('4') })],
    });
    const { service } = buildServiceForCancel(tx);

    const result = await service.cancel(actor, invoiceId);

    expect(result.status).toBe('CANCELLED');
    expect(tx.purchaseOrderItem.findMany).not.toHaveBeenCalled();
    expect(tx.__poItemUpdateCalls).toHaveLength(0);
  });

  it('20. cancels a CONFIRMED invoice with a SINGLE line: invoicedQuantity correctly decremented under the invoice -> PO -> PO-items lock order', async () => {
    const tx = buildCancelTx({
      invoiceId,
      purchaseOrderId: poId,
      status: PurchaseInvoiceStatus.CONFIRMED,
      invoiceItems: [fullInvoiceItem({ id: 'pii1', purchaseOrderItemId: poItemId, quantity: decimal('4') })],
      poItems: [{ id: poItemId, invoicedQuantity: decimal('4') }],
    });
    const { service } = buildServiceForCancel(tx);

    const result = await service.cancel(actor, invoiceId);

    expect(result.status).toBe('CANCELLED');
    expect(tx.purchaseOrderItem.findMany).toHaveBeenCalled();
    expect(tx.__poItemUpdateCalls).toHaveLength(1);
    expect(tx.__poItemUpdateCalls[0].data.invoicedQuantity.toFixed(0)).toBe('0');
  });

  it('AGGREGATE cancellation: a CONFIRMED invoice with two lines (4 + 3) against the same PO item reverses to 0 in ONE update, never a per-line decrement', async () => {
    const tx = buildCancelTx({
      invoiceId,
      purchaseOrderId: poId,
      status: PurchaseInvoiceStatus.CONFIRMED,
      invoiceItems: [
        fullInvoiceItem({ id: 'pii1', purchaseOrderItemId: poItemId, quantity: decimal('4') }),
        fullInvoiceItem({ id: 'pii2', purchaseOrderItemId: poItemId, quantity: decimal('3') }),
      ],
      poItems: [{ id: poItemId, invoicedQuantity: decimal('7') }],
    });
    const { service } = buildServiceForCancel(tx);

    const result = await service.cancel(actor, invoiceId);

    expect(result.status).toBe('CANCELLED');
    // Exactly ONE update call for the PO item, not two independent ones that
    // would otherwise clobber each other (the bug the final correction fixed).
    expect(tx.__poItemUpdateCalls).toHaveLength(1);
    expect(tx.__poItemUpdateCalls[0].data.invoicedQuantity.toFixed(0)).toBe('0');

    // A subsequent invoice can now consume the fully-freed capacity.
    const nextOrder = buildOrder([
      basePoItem({ receivedQuantity: decimal('20'), invoicedQuantity: decimal('0') }),
    ]);
    const prisma = buildCreatePrisma({ order: nextOrder });
    const { service: createService } = buildService(prisma);
    const created = await createService.create(actor, {
      purchaseOrderId: poId,
      items: [{ purchaseOrderItemId: poItemId, quantity: '20', unitCost: '10' }],
    });
    expect(created.items[0].quantity).toBe('20.000000');
  });

  it('21. cancel() rejects once amountPaid > 0 (forward-compatible guard for the future Supplier Payment phase)', async () => {
    const tx = buildCancelTx({
      invoiceId,
      purchaseOrderId: poId,
      status: PurchaseInvoiceStatus.CONFIRMED,
      amountPaid: decimal('50'),
      invoiceItems: [fullInvoiceItem({ id: 'pii1', purchaseOrderItemId: poItemId, quantity: decimal('4') })],
      poItems: [{ id: poItemId, invoicedQuantity: decimal('4') }],
    });
    const { service } = buildServiceForCancel(tx);

    await expect(service.cancel(actor, invoiceId)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.__poItemUpdateCalls).toHaveLength(0);
  });

  it('22. cancel-reversal negative-invoicedQuantity guard throws rather than clamping or going negative', async () => {
    const tx = buildCancelTx({
      invoiceId,
      purchaseOrderId: poId,
      status: PurchaseInvoiceStatus.CONFIRMED,
      invoiceItems: [fullInvoiceItem({ id: 'pii1', purchaseOrderItemId: poItemId, quantity: decimal('4') })],
      // Corrupted state: invoicedQuantity (2) is already less than this
      // invoice's own contribution (4) — should never happen in correct
      // operation, but must be surfaced rather than silently clamped.
      poItems: [{ id: poItemId, invoicedQuantity: decimal('2') }],
    });
    const { service } = buildServiceForCancel(tx);

    await expect(service.cancel(actor, invoiceId)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.__poItemUpdateCalls).toHaveLength(0);
  });

  it('cancel() rejects a non-DRAFT/non-CONFIRMED invoice (already CANCELLED)', async () => {
    const tx = buildCancelTx({
      invoiceId,
      purchaseOrderId: poId,
      status: PurchaseInvoiceStatus.CANCELLED,
      invoiceItems: [],
    });
    const { service } = buildServiceForCancel(tx);

    await expect(service.cancel(actor, invoiceId)).rejects.toBeInstanceOf(ConflictException);
  });

  // ============================== getById / list / regression =============

  it('returns 404 for a missing/cross-tenant invoice on getById', async () => {
    const prisma: any = { purchaseInvoice: { findFirst: jest.fn().mockResolvedValue(null) } };
    const { service } = buildService(prisma);
    await expect(service.getById(actor, invoiceId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('25. regression: list() batches the mismatch PO-item lookup in one query, never N+1', async () => {
    const rows = [
      rowFromCreateData('inv-1', {
        tenantId, invoiceNumber: 'PINV-1', supplierInvoiceNumber: null, purchaseOrderId: poId,
        status: PurchaseInvoiceStatus.DRAFT, supplierId, supplierName: 'Acme', supplierGstin: null,
        supplierBillingAddress: null, paymentTermId: null, invoiceDate: new Date(), dueDate: null, notes: null,
        subtotal: decimal('10'), discountTotal: decimal('0'), taxTotal: decimal('0'), total: decimal('10'),
        items: { create: [{ tenantId, purchaseOrderItemId: poItemId, goodsReceiptItemId: null, productId, productSku: 'S', productName: 'N', unitOfMeasureId: null, uomCode: null, uomName: null, conversionFactor: null, quantity: decimal('1'), unitCost: decimal('10'), discountPercent: decimal('0'), discountAmount: decimal('0'), taxCodeId: null, taxCode: null, taxCodeName: null, taxAmount: decimal('0'), lineSubtotal: decimal('10'), lineTotal: decimal('10'), taxComponents: { create: [] } }] },
      }),
      rowFromCreateData('inv-2', {
        tenantId, invoiceNumber: 'PINV-2', supplierInvoiceNumber: null, purchaseOrderId: poId,
        status: PurchaseInvoiceStatus.DRAFT, supplierId, supplierName: 'Acme', supplierGstin: null,
        supplierBillingAddress: null, paymentTermId: null, invoiceDate: new Date(), dueDate: null, notes: null,
        subtotal: decimal('20'), discountTotal: decimal('0'), taxTotal: decimal('0'), total: decimal('20'),
        items: { create: [{ tenantId, purchaseOrderItemId: poItemId2, goodsReceiptItemId: null, productId, productSku: 'S', productName: 'N', unitOfMeasureId: null, uomCode: null, uomName: null, conversionFactor: null, quantity: decimal('2'), unitCost: decimal('10'), discountPercent: decimal('0'), discountAmount: decimal('0'), taxCodeId: null, taxCode: null, taxCodeName: null, taxAmount: decimal('0'), lineSubtotal: decimal('20'), lineTotal: decimal('20'), taxComponents: { create: [] } }] },
      }),
    ];
    const prisma: any = {
      purchaseInvoice: { findMany: jest.fn().mockResolvedValue(rows) },
      purchaseOrderItem: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const { service } = buildService(prisma);

    const result = await service.list(actor);

    expect(result.items).toHaveLength(2);
    expect(prisma.purchaseOrderItem.findMany).toHaveBeenCalledTimes(1);
    const whereIn = prisma.purchaseOrderItem.findMany.mock.calls[0][0].where.id.in;
    expect(whereIn.sort()).toEqual([poItemId, poItemId2].sort());
  });

  // ============================== SUPPLIER PAYMENT V1 (Section 22.9) ======

  /** tx mock for recordPayment(): $queryRaw lock, findFirstOrThrow, supplierPayment.create, purchaseInvoice.update. */
  function buildPaymentTx(options: {
    invoiceId: string;
    status: PurchaseInvoiceStatus;
    paymentStatus: PurchaseInvoicePaymentStatus | string;
    total: Prisma.Decimal;
    amountPaid: Prisma.Decimal;
  }) {
    const updateCalls: Array<{ data: Record<string, unknown> }> = [];
    const createCalls: Array<{ data: Record<string, unknown> }> = [];
    let lastCreatedPayment: Record<string, unknown> | null = null;
    return {
      $queryRaw: jest.fn().mockResolvedValue([{ id: options.invoiceId }]),
      purchaseInvoice: {
        findFirstOrThrow: jest.fn().mockResolvedValue({
          id: options.invoiceId,
          status: options.status,
          paymentStatus: options.paymentStatus,
          total: options.total,
          amountPaid: options.amountPaid,
        }),
        update: jest.fn((args: { data: Record<string, unknown> }) => {
          updateCalls.push(args);
          return Promise.resolve(
            fullInvoiceHeader({
              id: options.invoiceId,
              total: options.total,
              amountPaid: args.data.amountPaid,
              paymentStatus: args.data.paymentStatus,
              items: [],
            }),
          );
        }),
      },
      supplierPayment: {
        create: jest.fn((args: { data: Record<string, unknown> }) => {
          createCalls.push(args);
          lastCreatedPayment = {
            id: 'payment-1',
            tenantId,
            purchaseInvoiceId: options.invoiceId,
            amount: args.data.amount,
            paymentDate: args.data.paymentDate,
            paymentMethodId: args.data.paymentMethodId,
            reference: args.data.reference,
            notes: args.data.notes,
            accountingPostingStatus: SupplierPaymentPostingStatus.NOT_POSTED,
            journalEntryId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          return Promise.resolve(lastCreatedPayment);
        }),
      },
      __updateCalls: updateCalls,
      __createCalls: createCalls,
      get __lastCreatedPayment() {
        return lastCreatedPayment;
      },
    };
  }

  function buildServiceForPayment(
    tx: ReturnType<typeof buildPaymentTx> | null,
    options: {
      accountingJournal?: unknown;
      supplierPayment?: Partial<Record<string, jest.Mock>>;
    } = {},
  ) {
    // The post-commit accounting step reads/writes the SAME payment row
    // recordPayment() just created inside the transaction above — so the
    // outer (non-tx) mock's defaults are seeded from tx.__lastCreatedPayment
    // once it exists, keeping fields like `amount` realistic instead of
    // silently reverting to a generic base object.
    const seed = () => tx?.__lastCreatedPayment ?? basePaymentFixture();
    const prisma: any = {
      $transaction: jest.fn(async (fn: (c: unknown) => Promise<unknown>) => fn(tx)),
      purchaseOrderItem: { findMany: jest.fn().mockResolvedValue([]) },
      supplierPayment: {
        update: jest.fn(({ where, data }: any) =>
          Promise.resolve({ ...seed(), id: where.id, ...data }),
        ),
        findFirstOrThrow: jest.fn(({ where }: any) =>
          Promise.resolve({ ...seed(), id: where.id }),
        ),
        ...options.supplierPayment,
      },
    };
    return buildService(prisma, options.accountingJournal);
  }

  it('records a partial payment: amountPaid accumulates, paymentStatus becomes PARTIALLY_PAID', async () => {
    const tx = buildPaymentTx({
      invoiceId,
      status: PurchaseInvoiceStatus.CONFIRMED,
      paymentStatus: PurchaseInvoicePaymentStatus.UNPAID,
      total: decimal('100'),
      amountPaid: decimal('0'),
    });
    const { service } = buildServiceForPayment(tx);

    const result = await service.recordPayment(actor, invoiceId, {
      amount: '40',
      paymentDate: '2026-09-17',
    });

    expect(tx.__updateCalls).toHaveLength(1);
    expect((tx.__updateCalls[0].data.amountPaid as Prisma.Decimal).toFixed(0)).toBe('40');
    expect(tx.__updateCalls[0].data.paymentStatus).toBe(PurchaseInvoicePaymentStatus.PARTIALLY_PAID);
    expect(result.payment.amount).toBe('40.0000');
    expect(result.invoice.amountPaid).toBe('40.0000');
    expect(result.invoice.paymentStatus).toBe(PurchaseInvoicePaymentStatus.PARTIALLY_PAID);
  });

  it('a payment that reaches the total moves paymentStatus to PAID', async () => {
    const tx = buildPaymentTx({
      invoiceId,
      status: PurchaseInvoiceStatus.CONFIRMED,
      paymentStatus: PurchaseInvoicePaymentStatus.PARTIALLY_PAID,
      total: decimal('100'),
      amountPaid: decimal('60'),
    });
    const { service } = buildServiceForPayment(tx);

    const result = await service.recordPayment(actor, invoiceId, {
      amount: '40',
      paymentDate: '2026-09-17',
    });

    expect((tx.__updateCalls[0].data.amountPaid as Prisma.Decimal).toFixed(0)).toBe('100');
    expect(tx.__updateCalls[0].data.paymentStatus).toBe(PurchaseInvoicePaymentStatus.PAID);
    expect(result.invoice.paymentStatus).toBe(PurchaseInvoicePaymentStatus.PAID);
  });

  it('supports multiple sequential partial payments accumulating correctly', async () => {
    // First payment: 0 -> 30.
    const tx1 = buildPaymentTx({
      invoiceId,
      status: PurchaseInvoiceStatus.CONFIRMED,
      paymentStatus: PurchaseInvoicePaymentStatus.UNPAID,
      total: decimal('100'),
      amountPaid: decimal('0'),
    });
    const { service: service1 } = buildServiceForPayment(tx1);
    await service1.recordPayment(actor, invoiceId, { amount: '30', paymentDate: '2026-09-01' });
    expect((tx1.__updateCalls[0].data.amountPaid as Prisma.Decimal).toFixed(0)).toBe('30');

    // Second payment: 30 -> 75 (simulating the committed state after the first).
    const tx2 = buildPaymentTx({
      invoiceId,
      status: PurchaseInvoiceStatus.CONFIRMED,
      paymentStatus: PurchaseInvoicePaymentStatus.PARTIALLY_PAID,
      total: decimal('100'),
      amountPaid: decimal('30'),
    });
    const { service: service2 } = buildServiceForPayment(tx2);
    const result2 = await service2.recordPayment(actor, invoiceId, { amount: '45', paymentDate: '2026-09-10' });
    expect((tx2.__updateCalls[0].data.amountPaid as Prisma.Decimal).toFixed(0)).toBe('75');
    expect(result2.invoice.paymentStatus).toBe(PurchaseInvoicePaymentStatus.PARTIALLY_PAID);
  });

  it('rejects a zero payment amount before ever opening a transaction', async () => {
    const prisma: any = { $transaction: jest.fn() };
    const { service } = buildService(prisma);

    await expect(
      service.recordPayment(actor, invoiceId, { amount: '0', paymentDate: '2026-09-17' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a negative payment amount', async () => {
    const prisma: any = { $transaction: jest.fn() };
    const { service } = buildService(prisma);

    await expect(
      service.recordPayment(actor, invoiceId, { amount: '-5', paymentDate: '2026-09-17' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an overpayment exceeding the remaining balance due', async () => {
    const tx = buildPaymentTx({
      invoiceId,
      status: PurchaseInvoiceStatus.CONFIRMED,
      paymentStatus: PurchaseInvoicePaymentStatus.PARTIALLY_PAID,
      total: decimal('100'),
      amountPaid: decimal('90'),
    });
    const { service } = buildServiceForPayment(tx);

    // balanceDue = 100 - 90 = 10; requesting 20 must be rejected.
    await expect(
      service.recordPayment(actor, invoiceId, { amount: '20', paymentDate: '2026-09-17' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.__createCalls).toHaveLength(0);
    expect(tx.__updateCalls).toHaveLength(0);
  });

  it('rejects a payment against a DRAFT invoice', async () => {
    const tx = buildPaymentTx({
      invoiceId,
      status: PurchaseInvoiceStatus.DRAFT,
      paymentStatus: PurchaseInvoicePaymentStatus.UNPAID,
      total: decimal('100'),
      amountPaid: decimal('0'),
    });
    const { service } = buildServiceForPayment(tx);

    await expect(
      service.recordPayment(actor, invoiceId, { amount: '10', paymentDate: '2026-09-17' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.__createCalls).toHaveLength(0);
  });

  it('rejects a payment against a CANCELLED invoice', async () => {
    const tx = buildPaymentTx({
      invoiceId,
      status: PurchaseInvoiceStatus.CANCELLED,
      paymentStatus: PurchaseInvoicePaymentStatus.UNPAID,
      total: decimal('100'),
      amountPaid: decimal('0'),
    });
    const { service } = buildServiceForPayment(tx);

    await expect(
      service.recordPayment(actor, invoiceId, { amount: '10', paymentDate: '2026-09-17' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.__createCalls).toHaveLength(0);
  });

  it('rejects a payment against an already fully PAID invoice', async () => {
    const tx = buildPaymentTx({
      invoiceId,
      status: PurchaseInvoiceStatus.CONFIRMED,
      paymentStatus: PurchaseInvoicePaymentStatus.PAID,
      total: decimal('100'),
      amountPaid: decimal('100'),
    });
    const { service } = buildServiceForPayment(tx);

    await expect(
      service.recordPayment(actor, invoiceId, { amount: '10', paymentDate: '2026-09-17' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.__createCalls).toHaveLength(0);
  });

  it('returns 404 for a missing/cross-tenant invoice on recordPayment', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]), // no lock row -> not found / cross-tenant
      purchaseInvoice: { findFirstOrThrow: jest.fn(), update: jest.fn() },
      supplierPayment: { create: jest.fn() },
    };
    const { service } = buildServiceForPayment(tx as never);

    await expect(
      service.recordPayment(actor, invoiceId, { amount: '10', paymentDate: '2026-09-17' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('locks the purchase_invoices row FOR UPDATE inside the transaction', async () => {
    const tx = buildPaymentTx({
      invoiceId,
      status: PurchaseInvoiceStatus.CONFIRMED,
      paymentStatus: PurchaseInvoicePaymentStatus.UNPAID,
      total: decimal('100'),
      amountPaid: decimal('0'),
    });
    const { service } = buildServiceForPayment(tx);

    await service.recordPayment(actor, invoiceId, { amount: '10', paymentDate: '2026-09-17' });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const args = tx.$queryRaw.mock.calls[0];
    const first = args[0] as { sql?: string } | string[];
    const sql =
      first && typeof first === 'object' && 'sql' in first && first.sql
        ? first.sql
        : Array.isArray(first)
          ? first.join(' ')
          : String(first);
    expect(sql).toContain('purchase_invoices');
    expect(sql).toContain('FOR UPDATE');
  });

  it('persists optional paymentMethodId/reference/notes when supplied, and null when omitted', async () => {
    const tx = buildPaymentTx({
      invoiceId,
      status: PurchaseInvoiceStatus.CONFIRMED,
      paymentStatus: PurchaseInvoicePaymentStatus.UNPAID,
      total: decimal('100'),
      amountPaid: decimal('0'),
    });
    const { service } = buildServiceForPayment(tx);

    await service.recordPayment(actor, invoiceId, {
      amount: '10',
      paymentDate: '2026-09-17',
      paymentMethodId: 'pm-1',
      reference: 'CHK-001',
      notes: 'Bank transfer',
    });

    expect(tx.__createCalls[0].data).toMatchObject({
      paymentMethodId: 'pm-1',
      reference: 'CHK-001',
      notes: 'Bank transfer',
    });

    const tx2 = buildPaymentTx({
      invoiceId,
      status: PurchaseInvoiceStatus.CONFIRMED,
      paymentStatus: PurchaseInvoicePaymentStatus.UNPAID,
      total: decimal('100'),
      amountPaid: decimal('0'),
    });
    const { service: service2 } = buildServiceForPayment(tx2);
    await service2.recordPayment(actor, invoiceId, { amount: '10', paymentDate: '2026-09-17' });
    expect(tx2.__createCalls[0].data).toMatchObject({
      paymentMethodId: null,
      reference: null,
      notes: null,
    });
  });

  it('records the purchase-invoice.payment-recorded audit event with correct metadata', async () => {
    const tx = buildPaymentTx({
      invoiceId,
      status: PurchaseInvoiceStatus.CONFIRMED,
      paymentStatus: PurchaseInvoicePaymentStatus.UNPAID,
      total: decimal('100'),
      amountPaid: decimal('0'),
    });
    const { service, audit } = buildServiceForPayment(tx);

    await service.recordPayment(actor, invoiceId, { amount: '25', paymentDate: '2026-09-17' });

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actor,
        action: 'purchase-invoice.payment-recorded',
        resource: 'purchase-invoice',
        resourceId: invoiceId,
        metadata: expect.objectContaining({
          paymentId: 'payment-1',
          amount: '25.0000',
          amountPaid: '25.0000',
          paymentStatus: PurchaseInvoicePaymentStatus.PARTIALLY_PAID,
        }),
      }),
    );
  });

  it('listPayments returns tenant-scoped payments ordered by paymentDate then createdAt', async () => {
    const rows = [
      { id: 'p2', tenantId, purchaseInvoiceId: invoiceId, amount: decimal('20'), paymentDate: new Date('2026-09-05'), paymentMethodId: null, reference: null, notes: null, createdAt: new Date(), updatedAt: new Date() },
      { id: 'p1', tenantId, purchaseInvoiceId: invoiceId, amount: decimal('30'), paymentDate: new Date('2026-09-01'), paymentMethodId: null, reference: null, notes: null, createdAt: new Date(), updatedAt: new Date() },
    ];
    const prisma: any = {
      purchaseInvoice: { findFirst: jest.fn().mockResolvedValue(fullInvoiceHeader({ id: invoiceId, items: [] })) },
      supplierPayment: { findMany: jest.fn().mockResolvedValue(rows) },
    };
    const { service } = buildService(prisma);

    const result = await service.listPayments(actor, invoiceId);

    expect(result.items).toHaveLength(2);
    expect(prisma.supplierPayment.findMany).toHaveBeenCalledWith({
      where: { purchaseInvoiceId: invoiceId, tenantId },
      orderBy: [{ paymentDate: 'asc' }, { createdAt: 'asc' }],
    });
  });

  it('listPayments returns 404 for a missing/cross-tenant invoice', async () => {
    const prisma: any = {
      purchaseInvoice: { findFirst: jest.fn().mockResolvedValue(null) },
      supplierPayment: { findMany: jest.fn() },
    };
    const { service } = buildService(prisma);

    await expect(service.listPayments(actor, invoiceId)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.supplierPayment.findMany).not.toHaveBeenCalled();
  });

  // ============================== PHASE C1/C2 — ACCOUNTING POSTING ========

  function confirmTxFixture() {
    return buildConfirmTx({
      invoiceId,
      purchaseOrderId: poId,
      initialStatus: PurchaseInvoiceStatus.DRAFT,
      invoiceItems: [
        fullInvoiceItem({ id: 'pii-1', purchaseOrderItemId: poItemId, quantity: decimal('5') }),
      ],
      poItems: [
        { id: poItemId, quantity: decimal('50'), receivedQuantity: decimal('20'), invoicedQuantity: decimal('0') },
      ],
    });
  }

  function cancelTxFixture(overrides: {
    accountingPostingStatus?: PurchaseInvoicePostingStatus;
    journalEntryId?: string | null;
  } = {}) {
    return buildCancelTx({
      invoiceId,
      purchaseOrderId: poId,
      status: PurchaseInvoiceStatus.CONFIRMED,
      invoiceItems: [
        fullInvoiceItem({ id: 'pii-1', purchaseOrderItemId: poItemId, quantity: decimal('5') }),
      ],
      poItems: [{ id: poItemId, invoicedQuantity: decimal('5') }],
      ...overrides,
    });
  }

  it('C1. confirm() succeeds even when accounting posting fails: invoice stays CONFIRMED, accountingPostingStatus becomes FAILED', async () => {
    const failingClient = buildAccountingJournalMock({
      post: jest.fn().mockRejectedValue(new Error('accounting service unreachable')),
    });
    const { service } = buildServiceForConfirm(confirmTxFixture(), [], {
      accountingJournal: failingClient,
    });

    const result = await service.confirm(actor, invoiceId);

    expect(result.status).toBe(PurchaseInvoiceStatus.CONFIRMED);
    expect(result.accountingPostingStatus).toBe(PurchaseInvoicePostingStatus.FAILED);
    expect(result.journalEntryId).toBeNull();
  });

  it('C2. cancelling a CONFIRMED invoice whose accounting posting is FAILED succeeds and never attempts a reversal', async () => {
    const cancelTx = cancelTxFixture({ accountingPostingStatus: PurchaseInvoicePostingStatus.FAILED });
    const client = buildAccountingJournalMock();
    const { service } = buildServiceForCancel(cancelTx, { accountingJournal: client });

    const result = await service.cancel(actor, invoiceId);

    expect(result.status).toBe(PurchaseInvoiceStatus.CANCELLED);
    expect(client.reverse).not.toHaveBeenCalled();
    // FAILED is left exactly as it was — there was never a journal to reverse.
    expect(result.accountingPostingStatus).toBe(PurchaseInvoicePostingStatus.FAILED);
  });

  it('C2b. cancelling a CONFIRMED invoice that was never even attempted (NOT_POSTED) also never attempts a reversal', async () => {
    const cancelTx = cancelTxFixture({ accountingPostingStatus: PurchaseInvoicePostingStatus.NOT_POSTED });
    const client = buildAccountingJournalMock();
    const { service } = buildServiceForCancel(cancelTx, { accountingJournal: client });

    const result = await service.cancel(actor, invoiceId);

    expect(client.reverse).not.toHaveBeenCalled();
    expect(result.accountingPostingStatus).toBe(PurchaseInvoicePostingStatus.NOT_POSTED);
  });

  it('C3. confirm() posts successfully, then cancel() creates a reversal journal — original journalEntryId is preserved, never cleared', async () => {
    const postingClient = buildAccountingJournalMock({
      post: jest.fn().mockResolvedValue({
        id: 'je-original', entryNumber: 'JE-00000010', status: 'POSTED',
        sourceService: 'purchase-service', sourceType: 'PURCHASE_INVOICE', sourceId: invoiceId,
        reversesJournalEntryId: null, idempotentReplay: false, totalDebit: '5.0000', totalCredit: '5.0000',
      }),
    });
    const { service: confirmService } = buildServiceForConfirm(confirmTxFixture(), [], {
      accountingJournal: postingClient,
    });
    const confirmed = await confirmService.confirm(actor, invoiceId);
    expect(confirmed.accountingPostingStatus).toBe(PurchaseInvoicePostingStatus.POSTED);
    expect(confirmed.journalEntryId).toBe('je-original');

    const reverseMock = jest.fn().mockResolvedValue({
      id: 'je-reversal', entryNumber: 'JE-00000011', status: 'POSTED',
      sourceService: 'purchase-service', sourceType: 'PURCHASE_INVOICE_CANCELLATION', sourceId: invoiceId,
      reversesJournalEntryId: 'je-original', idempotentReplay: false, totalDebit: '5.0000', totalCredit: '5.0000',
    });
    const cancelTx = cancelTxFixture({
      accountingPostingStatus: PurchaseInvoicePostingStatus.POSTED,
      journalEntryId: 'je-original',
    });
    const { service: cancelService } = buildServiceForCancel(cancelTx, {
      accountingJournal: buildAccountingJournalMock({ reverse: reverseMock }),
    });

    const cancelled = await cancelService.cancel(actor, invoiceId);

    expect(reverseMock).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        sourceService: 'purchase-service',
        sourceType: 'PURCHASE_INVOICE',
        sourceId: invoiceId,
        reversalSourceType: 'PURCHASE_INVOICE_CANCELLATION',
      }),
    );
    expect(cancelled.accountingPostingStatus).toBe(PurchaseInvoicePostingStatus.REVERSED);
    expect(cancelled.reversalJournalEntryId).toBe('je-reversal');
  });

  it('C4. retryAccountingPosting() on a FAILED invoice successfully posts and transitions to POSTED', async () => {
    const existingPrisma: any = {
      purchaseInvoice: {
        findFirst: jest.fn().mockResolvedValue(
          fullInvoiceHeader({
            id: invoiceId,
            status: PurchaseInvoiceStatus.CONFIRMED,
            accountingPostingStatus: PurchaseInvoicePostingStatus.FAILED,
            items: [],
          }),
        ),
        update: jest.fn(({ where, data }: any) =>
          Promise.resolve(
            fullInvoiceHeader({ id: where.id, status: PurchaseInvoiceStatus.CONFIRMED, items: [], ...data }),
          ),
        ),
      },
    };
    const client = buildAccountingJournalMock({
      post: jest.fn().mockResolvedValue({
        id: 'je-retry', entryNumber: 'JE-00000020', status: 'POSTED',
        sourceService: 'purchase-service', sourceType: 'PURCHASE_INVOICE', sourceId: invoiceId,
        reversesJournalEntryId: null, idempotentReplay: false, totalDebit: '5.0000', totalCredit: '5.0000',
      }),
    });
    const { service } = buildService(existingPrisma, client);

    const result = await service.retryAccountingPosting(actor, invoiceId);

    expect(client.post).toHaveBeenCalledTimes(1);
    expect(result.accountingPostingStatus).toBe(PurchaseInvoicePostingStatus.POSTED);
    expect(result.journalEntryId).toBe('je-retry');
  });

  it('C5. retryAccountingPosting() after the original request actually succeeded but the response was lost: accounting idempotency returns the existing journal, no duplicate is created', async () => {
    const existingPrisma: any = {
      purchaseInvoice: {
        findFirst: jest.fn().mockResolvedValue(
          fullInvoiceHeader({
            id: invoiceId,
            status: PurchaseInvoiceStatus.CONFIRMED,
            accountingPostingStatus: PurchaseInvoicePostingStatus.FAILED, // Purchase's own record of the lost response
            items: [],
          }),
        ),
        update: jest.fn(({ where, data }: any) =>
          Promise.resolve(
            fullInvoiceHeader({ id: where.id, status: PurchaseInvoiceStatus.CONFIRMED, items: [], ...data }),
          ),
        ),
      },
    };
    // accounting-service's own idempotency: the journal already exists from
    // the earlier (locally-lost) call, so it replays that same entry rather
    // than creating a second one.
    const client = buildAccountingJournalMock({
      post: jest.fn().mockResolvedValue({
        id: 'je-already-existing', entryNumber: 'JE-00000030', status: 'POSTED',
        sourceService: 'purchase-service', sourceType: 'PURCHASE_INVOICE', sourceId: invoiceId,
        reversesJournalEntryId: null, idempotentReplay: true, totalDebit: '5.0000', totalCredit: '5.0000',
      }),
    });
    const { service } = buildService(existingPrisma, client);

    const result = await service.retryAccountingPosting(actor, invoiceId);

    expect(client.post).toHaveBeenCalledTimes(1);
    expect(result.accountingPostingStatus).toBe(PurchaseInvoicePostingStatus.POSTED);
    expect(result.journalEntryId).toBe('je-already-existing');
  });

  it('C6. calling retryAccountingPosting() multiple times on an already-POSTED invoice never calls accounting-service again and never creates a duplicate', async () => {
    const alreadyPosted = fullInvoiceHeader({
      id: invoiceId,
      status: PurchaseInvoiceStatus.CONFIRMED,
      accountingPostingStatus: PurchaseInvoicePostingStatus.POSTED,
      journalEntryId: 'je-already-posted',
      items: [],
    });
    const prisma: any = {
      purchaseInvoice: { findFirst: jest.fn().mockResolvedValue(alreadyPosted) },
    };
    const client = buildAccountingJournalMock();
    const { service } = buildService(prisma, client);

    const first = await service.retryAccountingPosting(actor, invoiceId);
    const second = await service.retryAccountingPosting(actor, invoiceId);
    const third = await service.retryAccountingPosting(actor, invoiceId);

    expect(client.post).not.toHaveBeenCalled();
    for (const result of [first, second, third]) {
      expect(result.accountingPostingStatus).toBe(PurchaseInvoicePostingStatus.POSTED);
      expect(result.journalEntryId).toBe('je-already-posted');
    }
  });

  it('C7. retryAccountingPosting() on a CANCELLED invoice is rejected with 409 and never calls accounting-service', async () => {
    const prisma: any = {
      purchaseInvoice: {
        findFirst: jest.fn().mockResolvedValue(
          fullInvoiceHeader({
            id: invoiceId,
            status: PurchaseInvoiceStatus.CANCELLED,
            accountingPostingStatus: PurchaseInvoicePostingStatus.FAILED,
            items: [],
          }),
        ),
      },
    };
    const client = buildAccountingJournalMock();
    const { service } = buildService(prisma, client);

    await expect(service.retryAccountingPosting(actor, invoiceId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(client.post).not.toHaveBeenCalled();
  });

  it('C8. a Supplier Payment with no paymentMethodId is marked FAILED without ever calling accounting-service', async () => {
    const tx = buildPaymentTx({
      invoiceId,
      status: PurchaseInvoiceStatus.CONFIRMED,
      paymentStatus: PurchaseInvoicePaymentStatus.UNPAID,
      total: decimal('100'),
      amountPaid: decimal('0'),
    });
    const client = buildAccountingJournalMock();
    const { service } = buildServiceForPayment(tx, { accountingJournal: client });

    const result = await service.recordPayment(actor, invoiceId, {
      amount: '40',
      paymentDate: '2026-09-17',
    });

    expect(client.post).not.toHaveBeenCalled();
    expect(result.payment.accountingPostingStatus).toBe(SupplierPaymentPostingStatus.FAILED);
  });

  it('C9. a Supplier Payment with a paymentMethodId posts successfully: Dr Accounts Payable / Cr Payment Method', async () => {
    const tx = buildPaymentTx({
      invoiceId,
      status: PurchaseInvoiceStatus.CONFIRMED,
      paymentStatus: PurchaseInvoicePaymentStatus.UNPAID,
      total: decimal('100'),
      amountPaid: decimal('0'),
    });
    const postMock = jest.fn().mockResolvedValue({
      id: 'je-payment', entryNumber: 'JE-00000040', status: 'POSTED',
      sourceService: 'purchase-service', sourceType: 'SUPPLIER_PAYMENT', sourceId: 'payment-1',
      reversesJournalEntryId: null, idempotentReplay: false, totalDebit: '40.0000', totalCredit: '40.0000',
    });
    const { service } = buildServiceForPayment(tx, {
      accountingJournal: buildAccountingJournalMock({ post: postMock }),
    });

    const result = await service.recordPayment(actor, invoiceId, {
      amount: '40',
      paymentDate: '2026-09-17',
      paymentMethodId: 'pm-1',
    });

    expect(postMock).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        sourceType: 'SUPPLIER_PAYMENT',
        lines: [
          expect.objectContaining({ role: 'ACCOUNTS_PAYABLE', side: 'DEBIT', amount: '40.0000' }),
          expect.objectContaining({ role: 'PAYMENT_METHOD', side: 'CREDIT', amount: '40.0000', paymentMethodId: 'pm-1' }),
        ],
      }),
    );
    expect(result.payment.accountingPostingStatus).toBe(SupplierPaymentPostingStatus.POSTED);
    expect(result.payment.journalEntryId).toBe('je-payment');
  });

  // ===================== retryAccountingReversal() ========================

  it('R1. retryAccountingReversal() on a CANCELLED invoice whose reversal previously failed succeeds and transitions to REVERSED', async () => {
    const prisma: any = {
      purchaseInvoice: {
        findFirst: jest.fn().mockResolvedValue(
          fullInvoiceHeader({
            id: invoiceId,
            status: PurchaseInvoiceStatus.CANCELLED,
            accountingPostingStatus: PurchaseInvoicePostingStatus.POSTED,
            journalEntryId: 'je-original',
            items: [],
          }),
        ),
        update: jest.fn(({ where, data }: any) =>
          Promise.resolve(
            fullInvoiceHeader({
              id: where.id,
              status: PurchaseInvoiceStatus.CANCELLED,
              items: [],
              ...data,
            }),
          ),
        ),
      },
    };
    const reverseMock = jest.fn().mockResolvedValue({
      id: 'je-reversal-retry', entryNumber: 'JE-00000050', status: 'POSTED',
      sourceService: 'purchase-service', sourceType: 'PURCHASE_INVOICE_CANCELLATION', sourceId: invoiceId,
      reversesJournalEntryId: 'je-original', idempotentReplay: false, totalDebit: '5.0000', totalCredit: '5.0000',
    });
    const { service } = buildService(prisma, buildAccountingJournalMock({ reverse: reverseMock }));

    const result = await service.retryAccountingReversal(actor, invoiceId);

    expect(reverseMock).toHaveBeenCalledTimes(1);
    expect(reverseMock).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        sourceService: 'purchase-service',
        sourceType: 'PURCHASE_INVOICE',
        sourceId: invoiceId,
        reversalSourceType: 'PURCHASE_INVOICE_CANCELLATION',
      }),
    );
    expect(result.accountingPostingStatus).toBe(PurchaseInvoicePostingStatus.REVERSED);
    expect(result.reversalJournalEntryId).toBe('je-reversal-retry');
  });

  it('R2. retryAccountingReversal() on an already-REVERSED invoice is a no-op and never calls accounting-service again', async () => {
    const prisma: any = {
      purchaseInvoice: {
        findFirst: jest.fn().mockResolvedValue(
          fullInvoiceHeader({
            id: invoiceId,
            status: PurchaseInvoiceStatus.CANCELLED,
            accountingPostingStatus: PurchaseInvoicePostingStatus.REVERSED,
            journalEntryId: 'je-original',
            reversalJournalEntryId: 'je-reversal-existing',
            items: [],
          }),
        ),
      },
    };
    const client = buildAccountingJournalMock();
    const { service } = buildService(prisma, client);

    const result = await service.retryAccountingReversal(actor, invoiceId);

    expect(client.reverse).not.toHaveBeenCalled();
    expect(result.accountingPostingStatus).toBe(PurchaseInvoicePostingStatus.REVERSED);
    expect(result.reversalJournalEntryId).toBe('je-reversal-existing');
  });

  it('R3. retryAccountingReversal() on a non-CANCELLED invoice is rejected with 409 and never calls accounting-service', async () => {
    const prisma: any = {
      purchaseInvoice: {
        findFirst: jest.fn().mockResolvedValue(
          fullInvoiceHeader({
            id: invoiceId,
            status: PurchaseInvoiceStatus.CONFIRMED,
            accountingPostingStatus: PurchaseInvoicePostingStatus.POSTED,
            journalEntryId: 'je-original',
            items: [],
          }),
        ),
      },
    };
    const client = buildAccountingJournalMock();
    const { service } = buildService(prisma, client);

    await expect(service.retryAccountingReversal(actor, invoiceId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(client.reverse).not.toHaveBeenCalled();
  });

  it('R4. retryAccountingReversal() on a CANCELLED invoice with nothing to reverse (FAILED/NOT_POSTED) is rejected with 409', async () => {
    const failedPrisma: any = {
      purchaseInvoice: {
        findFirst: jest.fn().mockResolvedValue(
          fullInvoiceHeader({
            id: invoiceId,
            status: PurchaseInvoiceStatus.CANCELLED,
            accountingPostingStatus: PurchaseInvoicePostingStatus.FAILED,
            journalEntryId: null,
            items: [],
          }),
        ),
      },
    };
    const failedClient = buildAccountingJournalMock();
    const { service: failedService } = buildService(failedPrisma, failedClient);

    await expect(
      failedService.retryAccountingReversal(actor, invoiceId),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(failedClient.reverse).not.toHaveBeenCalled();

    const notPostedPrisma: any = {
      purchaseInvoice: {
        findFirst: jest.fn().mockResolvedValue(
          fullInvoiceHeader({
            id: invoiceId,
            status: PurchaseInvoiceStatus.CANCELLED,
            accountingPostingStatus: PurchaseInvoicePostingStatus.NOT_POSTED,
            journalEntryId: null,
            items: [],
          }),
        ),
      },
    };
    const notPostedClient = buildAccountingJournalMock();
    const { service: notPostedService } = buildService(notPostedPrisma, notPostedClient);

    await expect(
      notPostedService.retryAccountingReversal(actor, invoiceId),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(notPostedClient.reverse).not.toHaveBeenCalled();
  });

  it('R5. retryAccountingReversal() after the reversal actually succeeded but the response was lost: accounting idempotency returns the existing reversal, no duplicate is created; calling it again afterward is a no-op', async () => {
    let currentStatus: PurchaseInvoicePostingStatus = PurchaseInvoicePostingStatus.POSTED;
    let currentReversalId: string | null = null;
    const prisma: any = {
      purchaseInvoice: {
        findFirst: jest.fn(() =>
          Promise.resolve(
            fullInvoiceHeader({
              id: invoiceId,
              status: PurchaseInvoiceStatus.CANCELLED,
              accountingPostingStatus: currentStatus,
              journalEntryId: 'je-original',
              reversalJournalEntryId: currentReversalId,
              items: [],
            }),
          ),
        ),
        update: jest.fn(({ data }: any) => {
          currentStatus = data.accountingPostingStatus ?? currentStatus;
          currentReversalId = data.reversalJournalEntryId ?? currentReversalId;
          return Promise.resolve(
            fullInvoiceHeader({
              id: invoiceId,
              status: PurchaseInvoiceStatus.CANCELLED,
              items: [],
              accountingPostingStatus: currentStatus,
              journalEntryId: 'je-original',
              reversalJournalEntryId: currentReversalId,
            }),
          );
        }),
      },
    };
    // accounting-service's own idempotency: the reversal already exists from
    // an earlier (locally-lost) call, so it replays that same entry.
    const reverseMock = jest.fn().mockResolvedValue({
      id: 'je-already-existing-reversal', entryNumber: 'JE-00000060', status: 'POSTED',
      sourceService: 'purchase-service', sourceType: 'PURCHASE_INVOICE_CANCELLATION', sourceId: invoiceId,
      reversesJournalEntryId: 'je-original', idempotentReplay: true, totalDebit: '5.0000', totalCredit: '5.0000',
    });
    const { service } = buildService(prisma, buildAccountingJournalMock({ reverse: reverseMock }));

    const first = await service.retryAccountingReversal(actor, invoiceId);
    expect(reverseMock).toHaveBeenCalledTimes(1);
    expect(first.accountingPostingStatus).toBe(PurchaseInvoicePostingStatus.REVERSED);
    expect(first.reversalJournalEntryId).toBe('je-already-existing-reversal');

    const second = await service.retryAccountingReversal(actor, invoiceId);
    // Already REVERSED locally now — guard 2 short-circuits, no second call.
    expect(reverseMock).toHaveBeenCalledTimes(1);
    expect(second.reversalJournalEntryId).toBe('je-already-existing-reversal');
  });

  // ======================= PHASE 3.2 — GRNI CLEARING / PPV =================

  describe('Phase 3.2 — GRNI Clearing / PPV', () => {
    const grReceiptId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

    function matchedInvoiceItem(overrides: Record<string, unknown> = {}) {
      return fullInvoiceItem({
        id: 'pii-matched',
        purchaseOrderItemId: poItemId,
        goodsReceiptItemId: grItemId,
        productTracksInventory: true,
        quantity: decimal('5'),
        conversionFactor: null, // base UOM === commercial UOM (factor 1)
        unitCost: decimal('12'),
        lineSubtotal: decimal('60'), // 5 x 12, no discount
        goodsReceiptItem: { unitCost: decimal('10'), baseQuantity: decimal('20') },
        ...overrides,
      });
    }

    function postedReceipt(overrides: Record<string, unknown> = {}) {
      return {
        id: grReceiptId,
        status: 'POSTED',
        accountingPostingStatus: 'POSTED',
        ...overrides,
      };
    }

    function grItemLockRow(overrides: Record<string, unknown> = {}) {
      return {
        id: grItemId,
        goodsReceiptId: grReceiptId,
        baseQuantity: decimal('20'),
        unitCost: decimal('10'),
        ...overrides,
      };
    }

    function matchLockRow(overrides: Record<string, unknown> = {}) {
      return {
        id: 'match-1',
        goodsReceiptItemId: grItemId,
        matchedQuantity: decimal('0'),
        returnedQuantity: decimal('0'),
        ...overrides,
      };
    }

    function confirmWithMatchedItem(
      itemOverrides: Record<string, unknown> = {},
      txOverrides: Record<string, unknown> = {},
      journalPost?: jest.Mock,
    ) {
      const invoiceItems = [matchedInvoiceItem(itemOverrides)];
      // Single-line invoice, no tax: header total must equal the line's own
      // lineSubtotal for the posted journal to balance in these tests.
      const total = invoiceItems[0].lineSubtotal as Prisma.Decimal;
      const tx = buildConfirmTx({
        invoiceId,
        purchaseOrderId: poId,
        initialStatus: PurchaseInvoiceStatus.DRAFT,
        invoiceItems,
        poItems: [
          { id: poItemId, quantity: decimal('50'), receivedQuantity: decimal('20'), invoicedQuantity: decimal('0') },
        ],
        grItemRows: [grItemLockRow()],
        receipts: [postedReceipt()],
        matchRows: [matchLockRow()],
        header: { total, subtotal: total },
        ...txOverrides,
      });
      const accountingJournal = buildAccountingJournalMock(
        journalPost ? { post: journalPost } : {},
      );
      const { service } = buildServiceForConfirm(tx, [], { accountingJournal });
      return { service, tx, accountingJournal };
    }

    it('exact match: invoice cost === receipt cost clears GRNI fully with no PPV line', async () => {
      const post = jest.fn().mockResolvedValue({
        id: 'je-1', entryNumber: 'JE-1', status: 'POSTED', sourceService: 'purchase-service',
        sourceType: 'PURCHASE_INVOICE', sourceId: invoiceId, reversesJournalEntryId: null,
        idempotentReplay: false, totalDebit: '50.0000', totalCredit: '50.0000',
      });
      // Invoice cost = receipt cost = 10/unit, qty 5 -> 50 exactly.
      const { service } = confirmWithMatchedItem(
        { unitCost: decimal('10'), lineSubtotal: decimal('50') },
        {},
        post,
      );

      await service.confirm(actor, invoiceId);

      const request = post.mock.calls[0][1];
      const roles = request.lines.map((l: any) => l.role);
      expect(roles).not.toContain('PURCHASE_PRICE_VARIANCE');
      expect(roles).toContain('GOODS_RECEIVED_NOT_INVOICED');
      const grniLine = request.lines.find((l: any) => l.role === 'GOODS_RECEIVED_NOT_INVOICED');
      expect(grniLine.side).toBe('DEBIT');
      expect(grniLine.amount).toBe('50.0000');
      const totalDebit = request.lines
        .filter((l: any) => l.side === 'DEBIT')
        .reduce((sum: Prisma.Decimal, l: any) => sum.plus(l.amount), decimal('0'));
      const totalCredit = request.lines
        .filter((l: any) => l.side === 'CREDIT')
        .reduce((sum: Prisma.Decimal, l: any) => sum.plus(l.amount), decimal('0'));
      expect(totalDebit.toFixed(4)).toBe(totalCredit.toFixed(4));
    });

    it('invoice cost > receipt cost debits PURCHASE_PRICE_VARIANCE (unfavorable)', async () => {
      const post = jest.fn().mockResolvedValue({
        id: 'je-2', entryNumber: 'JE-2', status: 'POSTED', sourceService: 'purchase-service',
        sourceType: 'PURCHASE_INVOICE', sourceId: invoiceId, reversesJournalEntryId: null,
        idempotentReplay: false, totalDebit: '60.0000', totalCredit: '60.0000',
      });
      // Receipt cost 10/unit x 5 = 50; invoice cost 12/unit x 5 = 60 -> PPV +10.
      const { service } = confirmWithMatchedItem({}, {}, post);

      await service.confirm(actor, invoiceId);

      const request = post.mock.calls[0][1];
      const ppvLine = request.lines.find((l: any) => l.role === 'PURCHASE_PRICE_VARIANCE');
      expect(ppvLine).toBeDefined();
      expect(ppvLine.side).toBe('DEBIT');
      expect(ppvLine.amount).toBe('10.0000');
    });

    it('invoice cost < receipt cost credits PURCHASE_PRICE_VARIANCE (favorable)', async () => {
      const post = jest.fn().mockResolvedValue({
        id: 'je-3', entryNumber: 'JE-3', status: 'POSTED', sourceService: 'purchase-service',
        sourceType: 'PURCHASE_INVOICE', sourceId: invoiceId, reversesJournalEntryId: null,
        idempotentReplay: false, totalDebit: '40.0000', totalCredit: '40.0000',
      });
      // Receipt cost 10/unit x 5 = 50; invoice cost 8/unit x 5 = 40 -> PPV -10.
      const { service } = confirmWithMatchedItem(
        { unitCost: decimal('8'), lineSubtotal: decimal('40') },
        {},
        post,
      );

      await service.confirm(actor, invoiceId);

      const request = post.mock.calls[0][1];
      const ppvLine = request.lines.find((l: any) => l.role === 'PURCHASE_PRICE_VARIANCE');
      expect(ppvLine).toBeDefined();
      expect(ppvLine.side).toBe('CREDIT');
      expect(ppvLine.amount).toBe('10.0000');
    });

    it('discount is reflected via lineSubtotal (net-of-discount PPV, no separate discount line)', async () => {
      const post = jest.fn().mockResolvedValue({
        id: 'je-4', entryNumber: 'JE-4', status: 'POSTED', sourceService: 'purchase-service',
        sourceType: 'PURCHASE_INVOICE', sourceId: invoiceId, reversesJournalEntryId: null,
        idempotentReplay: false, totalDebit: '55.0000', totalCredit: '55.0000',
      });
      // Gross 5 x 12 = 60, 10% discount = 6 -> lineSubtotal (net) = 54.
      // Receipt cost 50 -> PPV = 54 - 50 = +4 (unfavorable, debit).
      const { service } = confirmWithMatchedItem(
        { lineSubtotal: decimal('54') },
        {},
        post,
      );

      await service.confirm(actor, invoiceId);

      const request = post.mock.calls[0][1];
      const ppvLine = request.lines.find((l: any) => l.role === 'PURCHASE_PRICE_VARIANCE');
      expect(ppvLine.side).toBe('DEBIT');
      expect(ppvLine.amount).toBe('4.0000');
    });

    it('different UOM/conversionFactor: invoiceLineBaseQty uses conversionFactor, not raw commercial quantity', async () => {
      const post = jest.fn().mockResolvedValue({
        id: 'je-5', entryNumber: 'JE-5', status: 'POSTED', sourceService: 'purchase-service',
        sourceType: 'PURCHASE_INVOICE', sourceId: invoiceId, reversesJournalEntryId: null,
        idempotentReplay: false, totalDebit: '60.0000', totalCredit: '60.0000',
      });
      // 1 box, conversionFactor 5 -> 5 base units x receipt unitCost 10 = 50 GRNI clearing.
      const { service, tx } = confirmWithMatchedItem(
        {
          quantity: decimal('1'),
          conversionFactor: decimal('5'),
          unitCost: decimal('60'),
          lineSubtotal: decimal('60'),
        },
        {},
        post,
      );

      await service.confirm(actor, invoiceId);

      const request = post.mock.calls[0][1];
      const grniLine = request.lines.find((l: any) => l.role === 'GOODS_RECEIVED_NOT_INVOICED');
      expect(grniLine.amount).toBe('50.0000');
      // matchedQuantity accumulated in base units (1 x 5 = 5), not commercial units (1).
      expect(tx.__matchUpdateCalls[0].data.matchedQuantity.toFixed(0)).toBe('5');
    });

    it('non-inventory line (productTracksInventory === false) posts PURCHASE_EXPENSE only — no GR required, no GRNI/PPV', async () => {
      const post = jest.fn().mockResolvedValue({
        id: 'je-6', entryNumber: 'JE-6', status: 'POSTED', sourceService: 'purchase-service',
        sourceType: 'PURCHASE_INVOICE', sourceId: invoiceId, reversesJournalEntryId: null,
        idempotentReplay: false, totalDebit: '50.0000', totalCredit: '50.0000',
      });
      const invoiceItems = [
        fullInvoiceItem({
          id: 'pii-non-inv',
          purchaseOrderItemId: poItemId,
          goodsReceiptItemId: null,
          productTracksInventory: false,
          quantity: decimal('5'),
          lineSubtotal: decimal('50'),
        }),
      ];
      const tx = buildConfirmTx({
        invoiceId,
        purchaseOrderId: poId,
        initialStatus: PurchaseInvoiceStatus.DRAFT,
        invoiceItems,
        poItems: [
          { id: poItemId, quantity: decimal('50'), receivedQuantity: decimal('20'), invoicedQuantity: decimal('0') },
        ],
      });
      const { service } = buildServiceForConfirm(tx, [], {
        accountingJournal: buildAccountingJournalMock({ post }),
      });

      await service.confirm(actor, invoiceId);

      const request = post.mock.calls[0][1];
      const roles = request.lines.map((l: any) => l.role);
      expect(roles).toContain('PURCHASE_EXPENSE');
      expect(roles).not.toContain('GOODS_RECEIVED_NOT_INVOICED');
      expect(roles).not.toContain('PURCHASE_PRICE_VARIANCE');
      // No inventory-tracked line -> the new matching queries never run.
      expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    });

    it('historical NULL productTracksInventory behaves identically to false', async () => {
      const post = jest.fn().mockResolvedValue({
        id: 'je-7', entryNumber: 'JE-7', status: 'POSTED', sourceService: 'purchase-service',
        sourceType: 'PURCHASE_INVOICE', sourceId: invoiceId, reversesJournalEntryId: null,
        idempotentReplay: false, totalDebit: '50.0000', totalCredit: '50.0000',
      });
      const invoiceItems = [
        fullInvoiceItem({
          id: 'pii-null',
          purchaseOrderItemId: poItemId,
          goodsReceiptItemId: null,
          productTracksInventory: null,
          quantity: decimal('5'),
          lineSubtotal: decimal('50'),
        }),
      ];
      const tx = buildConfirmTx({
        invoiceId,
        purchaseOrderId: poId,
        initialStatus: PurchaseInvoiceStatus.DRAFT,
        invoiceItems,
        poItems: [
          { id: poItemId, quantity: decimal('50'), receivedQuantity: decimal('20'), invoicedQuantity: decimal('0') },
        ],
      });
      const { service } = buildServiceForConfirm(tx, [], {
        accountingJournal: buildAccountingJournalMock({ post }),
      });

      await service.confirm(actor, invoiceId);

      const request = post.mock.calls[0][1];
      const roles = request.lines.map((l: any) => l.role);
      expect(roles).toEqual(['PURCHASE_EXPENSE', 'ACCOUNTS_PAYABLE']);
    });

    it('rejects confirm() when an inventory-tracked line has no goodsReceiptItemId', async () => {
      const invoiceItems = [
        fullInvoiceItem({
          id: 'pii-missing-gr',
          purchaseOrderItemId: poItemId,
          goodsReceiptItemId: null,
          productTracksInventory: true,
          quantity: decimal('5'),
        }),
      ];
      const tx = buildConfirmTx({
        invoiceId,
        purchaseOrderId: poId,
        initialStatus: PurchaseInvoiceStatus.DRAFT,
        invoiceItems,
        poItems: [
          { id: poItemId, quantity: decimal('50'), receivedQuantity: decimal('20'), invoicedQuantity: decimal('0') },
        ],
      });
      const { service } = buildServiceForConfirm(tx);

      await expect(service.confirm(actor, invoiceId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects confirm() when the linked goods receipt is not yet POSTED', async () => {
      const { service } = confirmWithMatchedItem(
        {},
        { receipts: [postedReceipt({ status: 'PENDING_STOCK' })] },
      );

      await expect(service.confirm(actor, invoiceId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects confirm() when the goods receipt is POSTED but its GRNI accrual accountingPostingStatus is not POSTED', async () => {
      const { service } = confirmWithMatchedItem(
        {},
        { receipts: [postedReceipt({ accountingPostingStatus: 'FAILED' })] },
      );

      await expect(service.confirm(actor, invoiceId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects confirm() when invoice quantity exceeds the matchable goods receipt quantity', async () => {
      // baseQuantity=20, already matchedQuantity=17, this line adds 5 base units -> 22 > 20.
      const { service, tx } = confirmWithMatchedItem(
        {},
        { matchRows: [matchLockRow({ matchedQuantity: decimal('17') })] },
      );

      await expect(service.confirm(actor, invoiceId)).rejects.toBeInstanceOf(ConflictException);
      expect(tx.__matchUpdateCalls).toHaveLength(0);
    });

    it('partial invoice: accumulates matchedQuantity without exceeding baseQuantity, GRNI cleared proportionally', async () => {
      const post = jest.fn().mockResolvedValue({
        id: 'je-8', entryNumber: 'JE-8', status: 'POSTED', sourceService: 'purchase-service',
        sourceType: 'PURCHASE_INVOICE', sourceId: invoiceId, reversesJournalEntryId: null,
        idempotentReplay: false, totalDebit: '60.0000', totalCredit: '60.0000',
      });
      // baseQuantity=20, already matched 10; this invoice adds 5 more -> 15 <= 20, OK.
      const { service, tx } = confirmWithMatchedItem(
        {},
        { matchRows: [matchLockRow({ matchedQuantity: decimal('10') })] },
        post,
      );

      await service.confirm(actor, invoiceId);

      expect(tx.__matchUpdateCalls).toHaveLength(1);
      expect(tx.__matchUpdateCalls[0].data.matchedQuantity.toFixed(0)).toBe('15');
      const request = post.mock.calls[0][1];
      const grniLine = request.lines.find((l: any) => l.role === 'GOODS_RECEIVED_NOT_INVOICED');
      // Only THIS line's 5-unit portion clears at receipt cost (10/unit) = 50,
      // regardless of how much was already matched by a prior invoice.
      expect(grniLine.amount).toBe('50.0000');
    });

    it('cancelling a CONFIRMED matched invoice decrements matchedQuantity back', async () => {
      const cancelTx = buildCancelTx({
        invoiceId,
        purchaseOrderId: poId,
        status: PurchaseInvoiceStatus.CONFIRMED,
        invoiceItems: [matchedInvoiceItem()],
        poItems: [{ id: poItemId, invoicedQuantity: decimal('5') }],
      });
      (cancelTx as any).purchaseInvoiceGoodsReceiptMatch = {
        update: jest.fn((args: any) => Promise.resolve(args)),
      };
      // Call 1 is cancel()'s own invoice-lock query (buildCancelTx's
      // default); calls 2/3 (purchase_orders/purchase_order_items locks)
      // are awaited only for their side effect and never read; call 4 is
      // reverseGoodsReceiptMatches' own match-row lock query.
      let call = 0;
      (cancelTx as any).$queryRaw = jest.fn(() => {
        call += 1;
        if (call === 1) return Promise.resolve([{ id: invoiceId }]);
        return Promise.resolve([
          { id: 'match-1', goodsReceiptItemId: grItemId, matchedQuantity: decimal('5') },
        ]);
      });
      const { service } = buildServiceForCancel(cancelTx);

      await service.cancel(actor, invoiceId);

      const updateCalls = (cancelTx as any).purchaseInvoiceGoodsReceiptMatch.update.mock.calls;
      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0][0].data.matchedQuantity.toFixed(0)).toBe('0');
    });

    it('journal always balances across every GRNI/PPV scenario (debits === credits)', async () => {
      const scenarios = [
        { unitCost: decimal('10'), lineSubtotal: decimal('50') }, // exact match
        { unitCost: decimal('12'), lineSubtotal: decimal('60') }, // unfavorable
        { unitCost: decimal('8'), lineSubtotal: decimal('40') }, // favorable
      ];
      for (const overrides of scenarios) {
        const post = jest.fn().mockResolvedValue({
          id: 'je-x', entryNumber: 'JE-X', status: 'POSTED', sourceService: 'purchase-service',
          sourceType: 'PURCHASE_INVOICE', sourceId: invoiceId, reversesJournalEntryId: null,
          idempotentReplay: false, totalDebit: '0.0000', totalCredit: '0.0000',
        });
        const { service } = confirmWithMatchedItem(overrides, {}, post);

        await service.confirm(actor, invoiceId);

        const request = post.mock.calls[0][1];
        expect(request.sourceType).toBe('PURCHASE_INVOICE');
        expect(request.sourceId).toBe(invoiceId);
        const totalDebit = request.lines
          .filter((l: any) => l.side === 'DEBIT')
          .reduce((sum: Prisma.Decimal, l: any) => sum.plus(l.amount), decimal('0'));
        const totalCredit = request.lines
          .filter((l: any) => l.side === 'CREDIT')
          .reduce((sum: Prisma.Decimal, l: any) => sum.plus(l.amount), decimal('0'));
        expect(totalDebit.toFixed(4)).toBe(totalCredit.toFixed(4));
      }
    });
  });
});
