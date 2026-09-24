import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  GoodsReceiptPostingStatus,
  GoodsReceiptStatus,
  Prisma,
  PurchaseOrderStatus,
} from '../../generated/prisma-client';
import { AccountingJournalClient } from '../accounting/accounting-journal.client';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { InventoryStockClient } from '../inventory/inventory-stock.client';
import { GoodsReceiptsService } from './goods-receipts.service';

describe('GoodsReceiptsService', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const poId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const poItemId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const poItemId2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddf';
  const productId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const warehouseId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const receiptId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const uomId = '99999999-9999-4999-8999-999999999999';

  function decimal(v: string) {
    return new Prisma.Decimal(v);
  }

  /**
   * Extracts readable SQL text from a $queryRaw call's first argument, which
   * is either a Prisma.Sql (from `tx.$queryRaw(Prisma.sql\`...\`)`, exposing
   * `.sql`) or a raw tagged-template strings array (from
   * `` tx.$queryRaw`...` `` called directly, exposing no `.sql`).
   */
  function sqlText(args: unknown[]): string {
    const first = args[0] as { sql?: string } | string[];
    if (first && typeof first === 'object' && 'sql' in first && first.sql) {
      return first.sql;
    }
    if (Array.isArray(first)) {
      return first.join(' ');
    }
    return String(first);
  }

  /** Base-UOM PO item: no UOM selected, no conversionFactor — implicit factor 1. */
  function basePoItem(overrides: Record<string, unknown> = {}) {
    return {
      id: poItemId,
      tenantId: actor.tenantId,
      productId,
      productSku: 'SKU-1',
      productName: 'Widget',
      quantity: decimal('10'),
      receivedQuantity: decimal('0'),
      unitOfMeasureId: null,
      uomCode: null,
      uomName: null,
      conversionFactor: null,
      // PurchaseOrderItem.unitCost is NOT NULL in production (Phase 3.1 —
      // GRNI Accounting); every PO item mock carries one so
      // preparePendingReceipt()'s snapshot step has real data to copy.
      unitCost: decimal('10'),
      ...overrides,
    };
  }

  /** Alternate-UOM PO item: BOX, conversionFactor 10 (frozen on the PO item). */
  function boxPoItem(overrides: Record<string, unknown> = {}) {
    return {
      id: poItemId,
      tenantId: actor.tenantId,
      productId,
      productSku: 'SKU-1',
      productName: 'Widget',
      quantity: decimal('10'),
      receivedQuantity: decimal('0'),
      unitOfMeasureId: uomId,
      uomCode: 'BOX',
      uomName: 'Box',
      conversionFactor: decimal('10'),
      unitCost: decimal('10'),
      ...overrides,
    };
  }

  function buildOrder(items: unknown[], overrides: Record<string, unknown> = {}) {
    return {
      id: poId,
      tenantId: actor.tenantId,
      status: PurchaseOrderStatus.CONFIRMED,
      items,
      ...overrides,
    };
  }

  /** tx mock for preparePendingReceipt(): $queryRaw x2 (PO lock, PO-items lock), findFirst, pending findMany, create. */
  function buildPrepareTx(options: {
    order: ReturnType<typeof buildOrder>;
    pendingItems?: Array<{ purchaseOrderItemId: string; quantity: Prisma.Decimal }>;
  }) {
    const queryRawCalls: unknown[][] = [];
    const created = { data: undefined as unknown };
    return {
      $queryRaw: jest.fn((...args: unknown[]) => {
        queryRawCalls.push(args);
        if (queryRawCalls.length === 1) {
          return Promise.resolve([
            { id: options.order.id, status: options.order.status },
          ]);
        }
        return Promise.resolve([{ id: 'lock-row' }]);
      }),
      purchaseOrder: { findFirst: jest.fn().mockResolvedValue(options.order) },
      goodsReceiptItem: {
        findMany: jest.fn().mockResolvedValue(options.pendingItems ?? []),
      },
      goodsReceipt: {
        create: jest.fn((args: { data: unknown }) => {
          created.data = args.data;
          return Promise.resolve({ id: 'created' });
        }),
      },
      __queryRawCalls: queryRawCalls,
      __created: created,
    };
  }

  /** tx mock for finalizePosted(): $queryRaw x3 (GR lock, PO lock, PO-items lock), findFirstOrThrow, updates. */
  function buildFinalizeTx(options: {
    receiptId: string;
    purchaseOrderId: string;
    initialStatus: GoodsReceiptStatus;
    receiptItems: Array<Record<string, unknown>>;
    poItems: Array<{
      id: string;
      quantity: Prisma.Decimal;
      receivedQuantity: Prisma.Decimal;
    }>;
    postedResult: Record<string, unknown>;
  }) {
    const queryRawCalls: unknown[][] = [];
    const fullReceipt = {
      id: options.receiptId,
      tenantId: actor.tenantId,
      purchaseOrderId: options.purchaseOrderId,
      warehouseId,
      status: options.initialStatus,
      receivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: options.receiptItems,
      purchaseOrder: { items: options.poItems },
    };
    return {
      $queryRaw: jest.fn((...args: unknown[]) => {
        queryRawCalls.push(args);
        if (queryRawCalls.length === 1) {
          return Promise.resolve([
            {
              id: options.receiptId,
              status: options.initialStatus,
              purchaseOrderId: options.purchaseOrderId,
            },
          ]);
        }
        return Promise.resolve([{ id: 'lock-row' }]);
      }),
      goodsReceipt: {
        findFirstOrThrow: jest.fn().mockResolvedValue(fullReceipt),
        update: jest.fn().mockResolvedValue(options.postedResult),
      },
      purchaseOrderItem: {
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue(
          options.poItems.map((item) => ({
            ...item,
            receivedQuantity: item.receivedQuantity, // updated by test setup, see below
          })),
        ),
      },
      purchaseOrder: { update: jest.fn() },
      // Phase 3.5 — persists GoodsReceiptItem.inventoryMovementId.
      goodsReceiptItem: { update: jest.fn().mockResolvedValue({}) },
      __queryRawCalls: queryRawCalls,
    };
  }

  function buildService(
    prepareTx: ReturnType<typeof buildPrepareTx> | null,
    finalizeTx: ReturnType<typeof buildFinalizeTx> | null,
    extra: {
      findFirst?: jest.Mock;
      applyReceipt?: jest.Mock;
      // Phase 3.1 (GRNI Accounting) — defaults are harmless no-ops so every
      // pre-existing test (none of which assert on accounting behavior)
      // keeps passing unmodified; GRNI-specific tests override these.
      updateGoodsReceipt?: jest.Mock;
      postJournal?: jest.Mock;
    } = {},
  ) {
    const txSequence = [prepareTx, finalizeTx].filter(
      (tx): tx is NonNullable<typeof tx> => tx !== null,
    );
    let call = 0;
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = txSequence[call];
        call += 1;
        return fn(tx);
      }),
      goodsReceipt: {
        findFirst: extra.findFirst ?? jest.fn().mockResolvedValue(postedResponse()),
        update:
          extra.updateGoodsReceipt ??
          jest.fn((args: { data: unknown }) =>
            Promise.resolve({ ...postedResponse(), ...(args.data as object) }),
          ),
      },
    };
    const inventory = {
      // Phase 3.5 — default mock returns one synthetic movement per line,
      // in the same order (mirrors StockReceiptsService's real positional
      // guarantee), so zipMovementIds() has something to zip against.
      applyReceipt:
        extra.applyReceipt ??
        jest.fn((_actor: unknown, body: { lines: Array<{ productId: string }> }) =>
          Promise.resolve({
            created: true,
            movements: body.lines.map((line, index) => ({
              id: `movement-${index}`,
              productId: line.productId,
            })),
          }),
        ),
    };
    const accountingJournal = {
      post:
        extra.postJournal ??
        jest.fn().mockResolvedValue({ id: 'journal-1', idempotentReplay: false }),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new GoodsReceiptsService(
      prisma as never,
      inventory as unknown as InventoryStockClient,
      audit as unknown as IdentityAuditClient,
      accountingJournal as unknown as AccountingJournalClient,
    );
    return { service, prisma, inventory, audit, accountingJournal };
  }

  function postedResponse(overrides: Record<string, unknown> = {}) {
    return {
      id: receiptId,
      tenantId: actor.tenantId,
      purchaseOrderId: poId,
      warehouseId,
      status: GoodsReceiptStatus.POSTED,
      receivedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      // Phase 3.1 (GRNI Accounting) — Purchase-side posting-status cache.
      accountingPostingStatus: GoodsReceiptPostingStatus.NOT_POSTED,
      journalEntryId: null,
      items: [],
      ...overrides,
    };
  }

  // --- 1. Base UOM: conversionFactor = 1 -> baseQuantity = quantity ---------
  it('1. base UOM line: baseQuantity equals quantity, Inventory receives quantity', async () => {
    const order = buildOrder([basePoItem()]);
    const prepareTx = buildPrepareTx({ order });
    const finalizeTx = buildFinalizeTx({
      receiptId: 'created',
      purchaseOrderId: poId,
      initialStatus: GoodsReceiptStatus.PENDING_STOCK,
      receiptItems: [
        {
          id: 'gri1',
          purchaseOrderItemId: poItemId,
          quantity: decimal('4'),
          baseQuantity: decimal('4'),
          productId,
          productSku: 'SKU-1',
          productName: 'Widget',
          unitOfMeasureId: null,
          uomCode: null,
          uomName: null,
          conversionFactor: decimal('1'),
        },
      ],
      poItems: [{ id: poItemId, quantity: decimal('10'), receivedQuantity: decimal('0') }],
      postedResult: postedResponse({
        items: [
          {
            id: 'gri1',
            tenantId: actor.tenantId,
            goodsReceiptId: 'created',
            purchaseOrderItemId: poItemId,
            quantity: decimal('4'),
            baseQuantity: decimal('4'),
            productId,
            productSku: 'SKU-1',
            productName: 'Widget',
            unitOfMeasureId: null,
            uomCode: null,
            uomName: null,
            conversionFactor: decimal('1'),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      }),
    });
    const { service, inventory } = buildService(prepareTx, finalizeTx);

    const result = await service.create(actor, {
      purchaseOrderId: poId,
      warehouseId,
      items: [{ purchaseOrderItemId: poItemId, quantity: '4' }],
    });

    expect(inventory.applyReceipt).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        lines: [{ productId, quantity: '4.000000', unitCost: '10.0000' }],
      }),
    );
    expect(result.items[0].baseQuantity).toBe('4.000000');
    expect(result.items[0].quantity).toBe('4.000000');
  });

  // --- 2. Alternate UOM: baseQuantity = quantity * conversionFactor --------
  it('2. alternate UOM line: baseQuantity = quantity x conversionFactor, Inventory receives baseQuantity not quantity', async () => {
    const order = buildOrder([boxPoItem()]);
    const prepareTx = buildPrepareTx({ order });
    const finalizeTx = buildFinalizeTx({
      receiptId: 'created',
      purchaseOrderId: poId,
      initialStatus: GoodsReceiptStatus.PENDING_STOCK,
      receiptItems: [
        {
          id: 'gri1',
          purchaseOrderItemId: poItemId,
          quantity: decimal('2'),
          baseQuantity: decimal('20'),
          productId,
          productSku: 'SKU-1',
          productName: 'Widget',
          unitOfMeasureId: uomId,
          uomCode: 'BOX',
          uomName: 'Box',
          conversionFactor: decimal('10'),
        },
      ],
      poItems: [{ id: poItemId, quantity: decimal('10'), receivedQuantity: decimal('0') }],
      postedResult: postedResponse({
        items: [
          {
            id: 'gri1',
            tenantId: actor.tenantId,
            goodsReceiptId: 'created',
            purchaseOrderItemId: poItemId,
            quantity: decimal('2'),
            baseQuantity: decimal('20'),
            productId,
            productSku: 'SKU-1',
            productName: 'Widget',
            unitOfMeasureId: uomId,
            uomCode: 'BOX',
            uomName: 'Box',
            conversionFactor: decimal('10'),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      }),
    });
    const { service, inventory } = buildService(prepareTx, finalizeTx);

    const result = await service.create(actor, {
      purchaseOrderId: poId,
      warehouseId,
      items: [{ purchaseOrderItemId: poItemId, quantity: '2' }],
    });

    // Inventory must receive baseQuantity (20), never the commercial quantity (2).
    expect(inventory.applyReceipt).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        lines: [{ productId, quantity: '20.000000', unitCost: '10.0000' }],
      }),
    );
    expect(result.items[0].quantity).toBe('2.000000');
    expect(result.items[0].baseQuantity).toBe('20.000000');
  });

  // --- 3. Snapshot copy -------------------------------------------------
  it('3. persists the full product/UOM snapshot copied from the parent PO item', async () => {
    const order = buildOrder([boxPoItem()]);
    const prepareTx = buildPrepareTx({ order });
    const { service } = buildService(
      prepareTx,
      buildFinalizeTx({
        receiptId: 'created',
        purchaseOrderId: poId,
        initialStatus: GoodsReceiptStatus.PENDING_STOCK,
        receiptItems: [],
        poItems: [{ id: poItemId, quantity: decimal('10'), receivedQuantity: decimal('0') }],
        postedResult: postedResponse(),
      }),
    );

    await service.create(actor, {
      purchaseOrderId: poId,
      warehouseId,
      items: [{ purchaseOrderItemId: poItemId, quantity: '2' }],
    });

    const createData = prepareTx.__created.data as {
      items: { create: Array<Record<string, unknown>> };
    };
    expect(createData.items.create[0]).toMatchObject({
      productId,
      productSku: 'SKU-1',
      productName: 'Widget',
      unitOfMeasureId: uomId,
      uomCode: 'BOX',
      uomName: 'Box',
    });
    expect((createData.items.create[0].conversionFactor as Prisma.Decimal).toFixed(0)).toBe('10');
    expect((createData.items.create[0].baseQuantity as Prisma.Decimal).toFixed(0)).toBe('20');
  });

  // --- 4. Partial + multiple partial receipts ---------------------------
  it('4. partial receipt keeps receivedQuantity in commercial UOM and transitions PO status to PARTIALLY_RECEIVED then RECEIVED', async () => {
    const order = buildOrder([boxPoItem({ quantity: decimal('2') })]);
    const prepareTx1 = buildPrepareTx({ order });
    const poItemsAfterFirst = [
      { id: poItemId, quantity: decimal('2'), receivedQuantity: decimal('1') },
    ];
    const finalizeTx1 = buildFinalizeTx({
      receiptId: 'gr1',
      purchaseOrderId: poId,
      initialStatus: GoodsReceiptStatus.PENDING_STOCK,
      receiptItems: [
        { id: 'gri1', purchaseOrderItemId: poItemId, quantity: decimal('1'), baseQuantity: decimal('10') },
      ],
      poItems: [{ id: poItemId, quantity: decimal('2'), receivedQuantity: decimal('0') }],
      postedResult: postedResponse({ id: 'gr1', status: GoodsReceiptStatus.POSTED }),
    });
    finalizeTx1.purchaseOrderItem.findMany.mockResolvedValue(poItemsAfterFirst);
    const { service: service1 } = buildService(prepareTx1, finalizeTx1);

    await service1.create(actor, {
      purchaseOrderId: poId,
      warehouseId,
      items: [{ purchaseOrderItemId: poItemId, quantity: '1' }],
    });

    // PO status after first partial receipt -> PARTIALLY_RECEIVED (1 < 2).
    expect(finalizeTx1.purchaseOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: PurchaseOrderStatus.PARTIALLY_RECEIVED },
      }),
    );
    // receivedQuantity accumulated in commercial UOM (1, not baseQuantity 10).
    expect(finalizeTx1.purchaseOrderItem.update).toHaveBeenCalledWith({
      where: { id: poItemId },
      data: { receivedQuantity: expect.objectContaining({}) },
    });
    const firstUpdateArg = finalizeTx1.purchaseOrderItem.update.mock.calls[0][0];
    expect((firstUpdateArg.data.receivedQuantity as Prisma.Decimal).toFixed(0)).toBe('1');

    // Second partial receipt: remaining = 2 - 1 = 1.
    const order2 = buildOrder([
      boxPoItem({ quantity: decimal('2'), receivedQuantity: decimal('1') }),
    ]);
    const prepareTx2 = buildPrepareTx({ order: order2 });
    const finalizeTx2 = buildFinalizeTx({
      receiptId: 'gr2',
      purchaseOrderId: poId,
      initialStatus: GoodsReceiptStatus.PENDING_STOCK,
      receiptItems: [
        { id: 'gri2', purchaseOrderItemId: poItemId, quantity: decimal('1'), baseQuantity: decimal('10') },
      ],
      poItems: [{ id: poItemId, quantity: decimal('2'), receivedQuantity: decimal('1') }],
      postedResult: postedResponse({ id: 'gr2', status: GoodsReceiptStatus.POSTED }),
    });
    finalizeTx2.purchaseOrderItem.findMany.mockResolvedValue([
      { id: poItemId, quantity: decimal('2'), receivedQuantity: decimal('2') },
    ]);
    const { service: service2 } = buildService(prepareTx2, finalizeTx2);

    await service2.create(actor, {
      purchaseOrderId: poId,
      warehouseId,
      items: [{ purchaseOrderItemId: poItemId, quantity: '1' }],
    });

    // receivedQuantity reaches quantity (2) -> RECEIVED.
    expect(finalizeTx2.purchaseOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: PurchaseOrderStatus.RECEIVED } }),
    );
    const secondUpdateArg = finalizeTx2.purchaseOrderItem.update.mock.calls[0][0];
    expect((secondUpdateArg.data.receivedQuantity as Prisma.Decimal).toFixed(0)).toBe('2');
  });

  // --- 5. Master-data factor changed after PO creation -------------------
  it('5. uses the conversionFactor frozen on the PO item, never a live master-data lookup', async () => {
    // The PO item's own conversionFactor (10) represents what was frozen at
    // PO-creation time; the service never calls any UOM-resolution client to
    // re-check it against current master data (e.g. a hypothetical new "12").
    const order = buildOrder([boxPoItem({ conversionFactor: decimal('10') })]);
    const prepareTx = buildPrepareTx({ order });
    const { service } = buildService(
      prepareTx,
      buildFinalizeTx({
        receiptId: 'created',
        purchaseOrderId: poId,
        initialStatus: GoodsReceiptStatus.PENDING_STOCK,
        receiptItems: [],
        poItems: [{ id: poItemId, quantity: decimal('10'), receivedQuantity: decimal('0') }],
        postedResult: postedResponse(),
      }),
    );

    await service.create(actor, {
      purchaseOrderId: poId,
      warehouseId,
      items: [{ purchaseOrderItemId: poItemId, quantity: '1' }],
    });

    const createData = prepareTx.__created.data as {
      items: { create: Array<Record<string, unknown>> };
    };
    expect((createData.items.create[0].conversionFactor as Prisma.Decimal).toFixed(0)).toBe('10');
    expect((createData.items.create[0].baseQuantity as Prisma.Decimal).toFixed(0)).toBe('10');
  });

  // --- 6. post() retry uses persisted baseQuantity ------------------------
  it('6. post() rebuilds Inventory lines strictly from the persisted baseQuantity, never recomputing', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: receiptId,
      tenantId: actor.tenantId,
      purchaseOrderId: poId,
      warehouseId,
      status: GoodsReceiptStatus.PENDING_STOCK,
      receivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [
        {
          id: 'gri1',
          tenantId: actor.tenantId,
          goodsReceiptId: receiptId,
          purchaseOrderItemId: poItemId,
          quantity: decimal('2'),
          baseQuantity: decimal('20'),
          productId,
          productSku: 'SKU-1',
          productName: 'Widget',
          unitOfMeasureId: uomId,
          uomCode: 'BOX',
          uomName: 'Box',
          conversionFactor: decimal('10'),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    const finalizeTx = buildFinalizeTx({
      receiptId,
      purchaseOrderId: poId,
      initialStatus: GoodsReceiptStatus.PENDING_STOCK,
      receiptItems: [],
      poItems: [{ id: poItemId, quantity: decimal('10'), receivedQuantity: decimal('0') }],
      postedResult: postedResponse(),
    });
    const { service, inventory } = buildService(null, finalizeTx, { findFirst });

    await service.post(actor, receiptId);

    expect(inventory.applyReceipt).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        lines: [{ productId, quantity: '20.000000' }],
      }),
    );
  });

  // --- 6b. Phase 3.5 — persists GoodsReceiptItem.inventoryMovementId -------
  it('6b. post() persists the Inventory movement id returned for each line onto GoodsReceiptItem.inventoryMovementId', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: receiptId,
      tenantId: actor.tenantId,
      purchaseOrderId: poId,
      warehouseId,
      status: GoodsReceiptStatus.PENDING_STOCK,
      receivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [
        {
          id: 'gri1',
          tenantId: actor.tenantId,
          goodsReceiptId: receiptId,
          purchaseOrderItemId: poItemId,
          quantity: decimal('2'),
          baseQuantity: decimal('20'),
          productId,
          productSku: 'SKU-1',
          productName: 'Widget',
          unitOfMeasureId: uomId,
          uomCode: 'BOX',
          uomName: 'Box',
          conversionFactor: decimal('10'),
          inventoryMovementId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    const finalizeTx = buildFinalizeTx({
      receiptId,
      purchaseOrderId: poId,
      initialStatus: GoodsReceiptStatus.PENDING_STOCK,
      receiptItems: [
        {
          id: 'gri1',
          purchaseOrderItemId: poItemId,
          quantity: decimal('2'),
          baseQuantity: decimal('20'),
          inventoryMovementId: null,
        },
      ],
      poItems: [{ id: poItemId, quantity: decimal('10'), receivedQuantity: decimal('0') }],
      postedResult: postedResponse(),
    });
    const applyReceipt = jest.fn().mockResolvedValue({
      created: true,
      movements: [{ id: 'movement-abc', productId }],
    });
    const { service } = buildService(null, finalizeTx, { findFirst, applyReceipt });

    await service.post(actor, receiptId);

    expect(finalizeTx.goodsReceiptItem.update).toHaveBeenCalledWith({
      where: { id: 'gri1' },
      data: { inventoryMovementId: 'movement-abc' },
    });
  });

  it('6c. post() never overwrites an already-set GoodsReceiptItem.inventoryMovementId', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: receiptId,
      tenantId: actor.tenantId,
      purchaseOrderId: poId,
      warehouseId,
      status: GoodsReceiptStatus.PENDING_STOCK,
      receivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [
        {
          id: 'gri1',
          tenantId: actor.tenantId,
          goodsReceiptId: receiptId,
          purchaseOrderItemId: poItemId,
          quantity: decimal('2'),
          baseQuantity: decimal('20'),
          productId,
          productSku: 'SKU-1',
          productName: 'Widget',
          unitOfMeasureId: uomId,
          uomCode: 'BOX',
          uomName: 'Box',
          conversionFactor: decimal('10'),
          inventoryMovementId: 'already-set',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    const finalizeTx = buildFinalizeTx({
      receiptId,
      purchaseOrderId: poId,
      initialStatus: GoodsReceiptStatus.PENDING_STOCK,
      receiptItems: [
        {
          id: 'gri1',
          purchaseOrderItemId: poItemId,
          quantity: decimal('2'),
          baseQuantity: decimal('20'),
          inventoryMovementId: 'already-set',
        },
      ],
      poItems: [{ id: poItemId, quantity: decimal('10'), receivedQuantity: decimal('0') }],
      postedResult: postedResponse(),
    });
    const applyReceipt = jest.fn().mockResolvedValue({
      created: false,
      movements: [{ id: 'movement-replay', productId }],
    });
    const { service } = buildService(null, finalizeTx, { findFirst, applyReceipt });

    await service.post(actor, receiptId);

    expect(finalizeTx.goodsReceiptItem.update).not.toHaveBeenCalled();
  });

  it('6d. post() rejects when Inventory returns a different number of movements than lines sent', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: receiptId,
      tenantId: actor.tenantId,
      purchaseOrderId: poId,
      warehouseId,
      status: GoodsReceiptStatus.PENDING_STOCK,
      receivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [
        {
          id: 'gri1',
          tenantId: actor.tenantId,
          goodsReceiptId: receiptId,
          purchaseOrderItemId: poItemId,
          quantity: decimal('2'),
          baseQuantity: decimal('20'),
          productId,
          productSku: 'SKU-1',
          productName: 'Widget',
          unitOfMeasureId: uomId,
          uomCode: 'BOX',
          uomName: 'Box',
          conversionFactor: decimal('10'),
          inventoryMovementId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    const applyReceipt = jest.fn().mockResolvedValue({ created: true, movements: [] });
    const { service } = buildService(null, null, { findFirst, applyReceipt });

    await expect(service.post(actor, receiptId)).rejects.toBeInstanceOf(ConflictException);
  });

  // --- 7. post() with NULL baseQuantity (legacy row) ----------------------
  it('7. post() rejects a legacy row with NULL baseQuantity rather than guessing', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: receiptId,
      tenantId: actor.tenantId,
      purchaseOrderId: poId,
      warehouseId,
      status: GoodsReceiptStatus.PENDING_STOCK,
      receivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [
        {
          id: 'gri1',
          tenantId: actor.tenantId,
          goodsReceiptId: receiptId,
          purchaseOrderItemId: poItemId,
          quantity: decimal('2'),
          baseQuantity: null,
          productId,
          productSku: 'SKU-1',
          productName: 'Widget',
          unitOfMeasureId: uomId,
          uomCode: 'BOX',
          uomName: 'Box',
          conversionFactor: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    const { service, inventory } = buildService(null, null, { findFirst });

    await expect(service.post(actor, receiptId)).rejects.toBeInstanceOf(ConflictException);
    expect(inventory.applyReceipt).not.toHaveBeenCalled();
  });

  // --- 8. Duplicate purchaseOrderItemId within one DTO --------------------
  it('8. rejects duplicate purchaseOrderItemId values within one goods receipt', async () => {
    const order = buildOrder([basePoItem()]);
    const prepareTx = buildPrepareTx({ order });
    const { service, inventory } = buildService(prepareTx, null);

    await expect(
      service.create(actor, {
        purchaseOrderId: poId,
        warehouseId,
        items: [
          { purchaseOrderItemId: poItemId, quantity: '2' },
          { purchaseOrderItemId: poItemId, quantity: '3' },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prepareTx.goodsReceipt.create).not.toHaveBeenCalled();
    expect(inventory.applyReceipt).not.toHaveBeenCalled();
  });

  // --- 9. purchaseOrderItemId from another PO / another tenant ------------
  it('9. rejects a purchaseOrderItemId that does not belong to the selected purchase order', async () => {
    const order = buildOrder([basePoItem()]); // only contains poItemId
    const prepareTx = buildPrepareTx({ order });
    const { service } = buildService(prepareTx, null);

    await expect(
      service.create(actor, {
        purchaseOrderId: poId,
        warehouseId,
        items: [{ purchaseOrderItemId: poItemId2, quantity: '1' }], // foreign PO item
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('9b. rejects a purchaseOrderItemId belonging to another tenant', async () => {
    const order = buildOrder([basePoItem({ tenantId: 'zzzzzzzz-zzzz-4zzz-8zzz-zzzzzzzzzzzz' })]);
    const prepareTx = buildPrepareTx({ order });
    const { service } = buildService(prepareTx, null);

    await expect(
      service.create(actor, {
        purchaseOrderId: poId,
        warehouseId,
        items: [{ purchaseOrderItemId: poItemId, quantity: '1' }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // --- 10. Cross-tenant getById/post ---------------------------------------
  it('10. returns 404 for a missing/cross-tenant receipt on getById', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const { service } = buildService(null, null, { findFirst });
    await expect(service.getById(actor, receiptId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('10b. returns 404 for a missing/cross-tenant receipt on post', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const { service } = buildService(null, null, { findFirst });
    await expect(service.post(actor, receiptId)).rejects.toBeInstanceOf(NotFoundException);
  });

  // --- 11. Over-receipt vs. receivedQuantity -------------------------------
  it('11. rejects over-receipt against remaining ordered quantity', async () => {
    const order = buildOrder([
      basePoItem({ quantity: decimal('10'), receivedQuantity: decimal('8') }),
    ]);
    const prepareTx = buildPrepareTx({ order });
    const { service, inventory } = buildService(prepareTx, null);

    await expect(
      service.create(actor, {
        purchaseOrderId: poId,
        warehouseId,
        items: [{ purchaseOrderItemId: poItemId, quantity: '5' }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(inventory.applyReceipt).not.toHaveBeenCalled();
  });

  // --- 12. Over-receipt vs. other in-flight PENDING_STOCK receipts --------
  it('12. rejects a line that would over-receive once other in-flight PENDING_STOCK receipts are counted', async () => {
    const order = buildOrder([
      basePoItem({ quantity: decimal('10'), receivedQuantity: decimal('0') }),
    ]);
    const prepareTx = buildPrepareTx({
      order,
      pendingItems: [{ purchaseOrderItemId: poItemId, quantity: decimal('6') }],
    });
    const { service, inventory } = buildService(prepareTx, null);

    // remaining = 10 - 0 - 6(pending) = 4; requesting 5 must be rejected.
    await expect(
      service.create(actor, {
        purchaseOrderId: poId,
        warehouseId,
        items: [{ purchaseOrderItemId: poItemId, quantity: '5' }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(inventory.applyReceipt).not.toHaveBeenCalled();
  });

  // --- 13. Two lines in the same DTO jointly exceeding remaining ----------
  it('13. two lines in one DTO against the same PO item are rejected as duplicates before quantity is ever checked', async () => {
    // D13 rejects duplicate purchaseOrderItemId unconditionally, before any
    // quantity math — so two lines against the same PO item can never reach
    // the "jointly exceeds remaining" arithmetic path; they are always
    // rejected as duplicates instead. This is a strictly stronger guarantee
    // than Sales' accumulate-into-pending-map behavior (which only rejects
    // once the combined quantity actually overflows).
    const order = buildOrder([
      basePoItem({ quantity: decimal('10'), receivedQuantity: decimal('0') }),
    ]);
    const prepareTx = buildPrepareTx({ order });
    const { service, inventory } = buildService(prepareTx, null);

    await expect(
      service.create(actor, {
        purchaseOrderId: poId,
        warehouseId,
        items: [
          { purchaseOrderItemId: poItemId, quantity: '7' },
          { purchaseOrderItemId: poItemId, quantity: '7' }, // 7+7=14 > 10, and a duplicate
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prepareTx.goodsReceipt.create).not.toHaveBeenCalled();
    expect(inventory.applyReceipt).not.toHaveBeenCalled();
  });

  // --- 14. Locking order ----------------------------------------------------
  it('14. locks purchase_orders then purchase_order_items, in order, inside preparePendingReceipt()', async () => {
    const order = buildOrder([basePoItem()]);
    const prepareTx = buildPrepareTx({ order });
    const { service } = buildService(
      prepareTx,
      buildFinalizeTx({
        receiptId: 'created',
        purchaseOrderId: poId,
        initialStatus: GoodsReceiptStatus.PENDING_STOCK,
        receiptItems: [],
        poItems: [{ id: poItemId, quantity: decimal('10'), receivedQuantity: decimal('0') }],
        postedResult: postedResponse(),
      }),
    );

    await service.create(actor, {
      purchaseOrderId: poId,
      warehouseId,
      items: [{ purchaseOrderItemId: poItemId, quantity: '1' }],
    });

    expect(prepareTx.$queryRaw).toHaveBeenCalledTimes(2);
    const firstSql = sqlText(prepareTx.__queryRawCalls[0]);
    const secondSql = sqlText(prepareTx.__queryRawCalls[1]);
    expect(firstSql).toContain('purchase_orders');
    expect(firstSql).not.toContain('purchase_order_items');
    expect(secondSql).toContain('purchase_order_items');
  });

  it('14b. locks goods_receipts then purchase_orders then purchase_order_items, in order, inside finalizePosted()', async () => {
    const order = buildOrder([basePoItem()]);
    const prepareTx = buildPrepareTx({ order });
    const finalizeTx = buildFinalizeTx({
      receiptId: 'created',
      purchaseOrderId: poId,
      initialStatus: GoodsReceiptStatus.PENDING_STOCK,
      receiptItems: [],
      poItems: [{ id: poItemId, quantity: decimal('10'), receivedQuantity: decimal('0') }],
      postedResult: postedResponse(),
    });
    const { service } = buildService(prepareTx, finalizeTx);

    await service.create(actor, {
      purchaseOrderId: poId,
      warehouseId,
      items: [{ purchaseOrderItemId: poItemId, quantity: '1' }],
    });

    expect(finalizeTx.$queryRaw).toHaveBeenCalledTimes(3);
    const [first, second, third] = finalizeTx.__queryRawCalls.map(sqlText);
    expect(first).toContain('goods_receipts');
    expect(first).not.toContain('purchase_orders');
    expect(second).toContain('purchase_orders');
    expect(second).not.toContain('purchase_order_items');
    expect(third).toContain('purchase_order_items');
  });

  // --- 15. Missing/invalid conversionFactor on a UOM-selected line --------
  it('15a. rejects a UOM-selected PO line with a missing conversionFactor, never defaulting to 1', async () => {
    const order = buildOrder([
      boxPoItem({ conversionFactor: null }), // unitOfMeasureId set, but no frozen factor
    ]);
    const prepareTx = buildPrepareTx({ order });
    const { service, inventory } = buildService(prepareTx, null);

    await expect(
      service.create(actor, {
        purchaseOrderId: poId,
        warehouseId,
        items: [{ purchaseOrderItemId: poItemId, quantity: '1' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(inventory.applyReceipt).not.toHaveBeenCalled();
  });

  it('15b. rejects a UOM-selected PO line with a zero conversionFactor', async () => {
    const order = buildOrder([boxPoItem({ conversionFactor: decimal('0') })]);
    const prepareTx = buildPrepareTx({ order });
    const { service } = buildService(prepareTx, null);

    await expect(
      service.create(actor, {
        purchaseOrderId: poId,
        warehouseId,
        items: [{ purchaseOrderItemId: poItemId, quantity: '1' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('15c. rejects a UOM-selected PO line with a negative conversionFactor', async () => {
    const order = buildOrder([boxPoItem({ conversionFactor: decimal('-2') })]);
    const prepareTx = buildPrepareTx({ order });
    const { service } = buildService(prepareTx, null);

    await expect(
      service.create(actor, {
        purchaseOrderId: poId,
        warehouseId,
        items: [{ purchaseOrderItemId: poItemId, quantity: '1' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // --- 16. Legacy PO line with no UOM at all -------------------------------
  it('16. a PO line with no UOM ever selected is accepted with an implicit factor of 1', async () => {
    const order = buildOrder([
      basePoItem({ unitOfMeasureId: null, uomCode: null, uomName: null, conversionFactor: null }),
    ]);
    const prepareTx = buildPrepareTx({ order });
    const { service } = buildService(
      prepareTx,
      buildFinalizeTx({
        receiptId: 'created',
        purchaseOrderId: poId,
        initialStatus: GoodsReceiptStatus.PENDING_STOCK,
        receiptItems: [],
        poItems: [{ id: poItemId, quantity: decimal('10'), receivedQuantity: decimal('0') }],
        postedResult: postedResponse(),
      }),
    );

    await service.create(actor, {
      purchaseOrderId: poId,
      warehouseId,
      items: [{ purchaseOrderItemId: poItemId, quantity: '5' }],
    });

    const createData = prepareTx.__created.data as {
      items: { create: Array<Record<string, unknown>> };
    };
    expect((createData.items.create[0].conversionFactor as Prisma.Decimal).toFixed(0)).toBe('1');
    expect((createData.items.create[0].baseQuantity as Prisma.Decimal).toFixed(0)).toBe('5');
  });

  // --- 17. Idempotency ------------------------------------------------------
  it('17. post() on an already-POSTED receipt returns it without calling Inventory', async () => {
    const posted = postedResponse({
      status: GoodsReceiptStatus.POSTED,
      items: [],
    });
    const findFirst = jest.fn().mockResolvedValue(posted);
    const { service, inventory } = buildService(null, null, { findFirst });

    const result = await service.post(actor, posted.id as string);
    expect(result.status).toBe(GoodsReceiptStatus.POSTED);
    expect(inventory.applyReceipt).not.toHaveBeenCalled();
  });

  // --- 18. Regression: PENDING_STOCK -> POSTED, bookkeeping, audit --------
  it('18. finalizePosted() transitions PENDING_STOCK -> POSTED and records the goods-receipt.posted audit event unchanged', async () => {
    const order = buildOrder([basePoItem()]);
    const prepareTx = buildPrepareTx({ order });
    const finalizeTx = buildFinalizeTx({
      receiptId: 'created',
      purchaseOrderId: poId,
      initialStatus: GoodsReceiptStatus.PENDING_STOCK,
      receiptItems: [
        { id: 'gri1', purchaseOrderItemId: poItemId, quantity: decimal('4'), baseQuantity: decimal('4') },
      ],
      poItems: [{ id: poItemId, quantity: decimal('10'), receivedQuantity: decimal('0') }],
      postedResult: postedResponse({
        status: GoodsReceiptStatus.POSTED,
        items: [
          {
            id: 'gri1',
            tenantId: actor.tenantId,
            goodsReceiptId: 'created',
            purchaseOrderItemId: poItemId,
            quantity: decimal('4'),
            baseQuantity: decimal('4'),
            productId,
            productSku: 'SKU-1',
            productName: 'Widget',
            unitOfMeasureId: null,
            uomCode: null,
            uomName: null,
            conversionFactor: decimal('1'),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      }),
    });
    finalizeTx.purchaseOrderItem.findMany.mockResolvedValue([
      { id: poItemId, quantity: decimal('10'), receivedQuantity: decimal('4') },
    ]);
    const { service, audit } = buildService(prepareTx, finalizeTx);

    const result = await service.create(actor, {
      purchaseOrderId: poId,
      warehouseId,
      items: [{ purchaseOrderItemId: poItemId, quantity: '4' }],
    });

    expect(result.status).toBe(GoodsReceiptStatus.POSTED);
    expect(finalizeTx.goodsReceipt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: GoodsReceiptStatus.POSTED }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'goods-receipt.posted',
        resource: 'goods-receipt',
      }),
    );
  });

  // ==========================================================================
  // Phase 3.1 — GRNI Accounting (Dr INVENTORY_ASSET / Cr GOODS_RECEIVED_NOT_INVOICED)
  // ==========================================================================
  describe('Phase 3.1 — GRNI Accounting', () => {
    /** Minimal-but-complete GoodsReceiptItem row for GRNI-only tests (only baseQuantity/unitCost vary). */
    function grniItem(overrides: Record<string, unknown> = {}) {
      return {
        id: 'gri1',
        tenantId: actor.tenantId,
        goodsReceiptId: receiptId,
        purchaseOrderItemId: poItemId,
        quantity: decimal('4'),
        baseQuantity: decimal('4'),
        unitCost: decimal('10'),
        productId,
        productSku: 'SKU-1',
        productName: 'Widget',
        unitOfMeasureId: null,
        uomCode: null,
        uomName: null,
        conversionFactor: decimal('1'),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
      };
    }

    it('A. snapshots PurchaseOrderItem.unitCost onto GoodsReceiptItem.unitCost at creation, never re-resolved', async () => {
      const order = buildOrder([basePoItem({ unitCost: decimal('12.5') })]);
      const prepareTx = buildPrepareTx({ order });
      const { service } = buildService(
        prepareTx,
        buildFinalizeTx({
          receiptId: 'created',
          purchaseOrderId: poId,
          initialStatus: GoodsReceiptStatus.PENDING_STOCK,
          receiptItems: [],
          poItems: [{ id: poItemId, quantity: decimal('10'), receivedQuantity: decimal('0') }],
          postedResult: postedResponse(),
        }),
      );

      await service.create(actor, {
        purchaseOrderId: poId,
        warehouseId,
        items: [{ purchaseOrderItemId: poItemId, quantity: '2' }],
      });

      const createData = prepareTx.__created.data as {
        items: { create: Array<Record<string, unknown>> };
      };
      expect((createData.items.create[0].unitCost as Prisma.Decimal).toFixed(2)).toBe('12.50');
    });

    it('C. posts Dr INVENTORY_ASSET / Cr GOODS_RECEIVED_NOT_INVOICED at baseQuantity x unitCost for a single-line receipt', async () => {
      const items = [grniItem({ baseQuantity: decimal('4'), unitCost: decimal('10') })];
      const findFirst = jest.fn().mockResolvedValue(
        postedResponse({ status: GoodsReceiptStatus.POSTED, items }),
      );
      const { service, accountingJournal } = buildService(null, null, { findFirst });

      await service.retryAccountingPosting(actor, receiptId);

      expect(accountingJournal.post).toHaveBeenCalledWith(actor, {
        sourceService: 'purchase-service',
        sourceType: 'GOODS_RECEIPT',
        sourceId: receiptId,
        description: `Goods Receipt ${receiptId}`,
        lines: [
          { role: 'INVENTORY_ASSET', side: 'DEBIT', amount: '40.0000' },
          { role: 'GOODS_RECEIVED_NOT_INVOICED', side: 'CREDIT', amount: '40.0000' },
        ],
      });
    });

    it('D. multi-line Goods Receipt sums baseQuantity x unitCost across all lines into one balanced journal', async () => {
      const items = [
        grniItem({ baseQuantity: decimal('4'), unitCost: decimal('10') }), // 40
        grniItem({ id: 'gri2', baseQuantity: decimal('5'), unitCost: decimal('8') }), // 40
      ];
      const findFirst = jest.fn().mockResolvedValue(
        postedResponse({ status: GoodsReceiptStatus.POSTED, items }),
      );
      const { service, accountingJournal } = buildService(null, null, { findFirst });

      await service.retryAccountingPosting(actor, receiptId);

      expect(accountingJournal.post).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          lines: [
            { role: 'INVENTORY_ASSET', side: 'DEBIT', amount: '80.0000' },
            { role: 'GOODS_RECEIVED_NOT_INVOICED', side: 'CREDIT', amount: '80.0000' },
          ],
        }),
      );
    });

    it('E. zero unitCost across all lines results in no journal being posted (stays NOT_POSTED, no accounting call)', async () => {
      const items = [grniItem({ baseQuantity: decimal('4'), unitCost: decimal('0') })];
      const findFirst = jest.fn().mockResolvedValue(
        postedResponse({
          status: GoodsReceiptStatus.POSTED,
          accountingPostingStatus: GoodsReceiptPostingStatus.NOT_POSTED,
          items,
        }),
      );
      const { service, accountingJournal } = buildService(null, null, { findFirst });

      const result = await service.retryAccountingPosting(actor, receiptId);

      expect(accountingJournal.post).not.toHaveBeenCalled();
      expect(result.accountingPostingStatus).toBe(GoodsReceiptPostingStatus.NOT_POSTED);
    });

    it('F. a legacy line with NULL unitCost is excluded from the journal without blocking the receipt', async () => {
      const items = [
        grniItem({ baseQuantity: decimal('4'), unitCost: null }), // legacy pre-migration row, no cost
        grniItem({ id: 'gri2', baseQuantity: decimal('5'), unitCost: decimal('8') }), // 40
      ];
      const findFirst = jest.fn().mockResolvedValue(
        postedResponse({ status: GoodsReceiptStatus.POSTED, items }),
      );
      const { service, accountingJournal } = buildService(null, null, { findFirst });

      await service.retryAccountingPosting(actor, receiptId);

      expect(accountingJournal.post).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          lines: [
            { role: 'INVENTORY_ASSET', side: 'DEBIT', amount: '40.0000' },
            { role: 'GOODS_RECEIVED_NOT_INVOICED', side: 'CREDIT', amount: '40.0000' },
          ],
        }),
      );
    });

    it('G. accounting posting failure does not roll back the already-POSTED goods receipt', async () => {
      const order = buildOrder([basePoItem()]);
      const prepareTx = buildPrepareTx({ order });
      const postedItems = [
        {
          id: 'gri1',
          tenantId: actor.tenantId,
          goodsReceiptId: 'created',
          purchaseOrderItemId: poItemId,
          quantity: decimal('4'),
          baseQuantity: decimal('4'),
          unitCost: decimal('10'),
          productId,
          productSku: 'SKU-1',
          productName: 'Widget',
          unitOfMeasureId: null,
          uomCode: null,
          uomName: null,
          conversionFactor: decimal('1'),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      const finalizeTx = buildFinalizeTx({
        receiptId: 'created',
        purchaseOrderId: poId,
        initialStatus: GoodsReceiptStatus.PENDING_STOCK,
        receiptItems: [{ id: 'gri1', purchaseOrderItemId: poItemId, quantity: decimal('4'), baseQuantity: decimal('4') }],
        poItems: [{ id: poItemId, quantity: decimal('10'), receivedQuantity: decimal('0') }],
        postedResult: postedResponse({ items: postedItems }),
      });
      const findFirst = jest.fn().mockResolvedValue(
        postedResponse({ items: postedItems, accountingPostingStatus: GoodsReceiptPostingStatus.FAILED }),
      );
      const postJournal = jest.fn().mockRejectedValue(new Error('accounting service unavailable'));
      const { service } = buildService(prepareTx, finalizeTx, { findFirst, postJournal });

      // create() must resolve successfully — the accounting failure is
      // swallowed post-commit, never propagated back to the caller.
      const result = await service.create(actor, {
        purchaseOrderId: poId,
        warehouseId,
        items: [{ purchaseOrderItemId: poItemId, quantity: '4' }],
      });

      expect(result.status).toBe(GoodsReceiptStatus.POSTED);
      expect(result.accountingPostingStatus).toBe(GoodsReceiptPostingStatus.FAILED);
      expect(postJournal).toHaveBeenCalledTimes(1);
    });

    it('H. retryAccountingPosting(): a FAILED posting retried succeeds and transitions to POSTED', async () => {
      const items = [grniItem({ baseQuantity: decimal('4'), unitCost: decimal('10') })];
      const findFirst = jest.fn().mockResolvedValue(
        postedResponse({
          status: GoodsReceiptStatus.POSTED,
          accountingPostingStatus: GoodsReceiptPostingStatus.FAILED,
          items,
        }),
      );
      const postJournal = jest.fn().mockResolvedValue({ id: 'journal-2', idempotentReplay: false });
      const updateGoodsReceipt = jest.fn((args: { data: unknown }) =>
        Promise.resolve(postedResponse({ items, ...(args.data as object) })),
      );
      const { service, accountingJournal } = buildService(null, null, {
        findFirst,
        postJournal,
        updateGoodsReceipt,
      });

      const result = await service.retryAccountingPosting(actor, receiptId);

      expect(accountingJournal.post).toHaveBeenCalledTimes(1);
      expect(result.accountingPostingStatus).toBe(GoodsReceiptPostingStatus.POSTED);
      expect(result.journalEntryId).toBe('journal-2');
    });

    it('I. retryAccountingPosting(): already-POSTED is a no-op, never calls accounting-service again', async () => {
      const findFirst = jest.fn().mockResolvedValue(
        postedResponse({
          status: GoodsReceiptStatus.POSTED,
          accountingPostingStatus: GoodsReceiptPostingStatus.POSTED,
          journalEntryId: 'journal-1',
          items: [],
        }),
      );
      const { service, accountingJournal } = buildService(null, null, { findFirst });

      const result = await service.retryAccountingPosting(actor, receiptId);

      expect(accountingJournal.post).not.toHaveBeenCalled();
      expect(result.accountingPostingStatus).toBe(GoodsReceiptPostingStatus.POSTED);
    });

    it('J. retryAccountingPosting(): rejected with 409 for a PENDING_STOCK receipt', async () => {
      const findFirst = jest.fn().mockResolvedValue(
        postedResponse({ status: GoodsReceiptStatus.PENDING_STOCK, items: [] }),
      );
      const { service, accountingJournal } = buildService(null, null, { findFirst });

      await expect(service.retryAccountingPosting(actor, receiptId)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(accountingJournal.post).not.toHaveBeenCalled();
    });

    it('K. an idempotent replay from accounting-service (idempotentReplay: true) still marks POSTED without erroring', async () => {
      const items = [{ baseQuantity: decimal('4'), unitCost: decimal('10') }];
      const findFirst = jest.fn().mockResolvedValue(
        postedResponse({ status: GoodsReceiptStatus.POSTED, items }),
      );
      const postJournal = jest.fn().mockResolvedValue({ id: 'journal-1', idempotentReplay: true });
      const { service, accountingJournal } = buildService(null, null, { findFirst, postJournal });

      const result = await service.retryAccountingPosting(actor, receiptId);

      expect(accountingJournal.post).toHaveBeenCalledTimes(1);
      expect(result.accountingPostingStatus).toBe(GoodsReceiptPostingStatus.POSTED);
      expect(result.journalEntryId).toBe('journal-1');
    });
  });
});
