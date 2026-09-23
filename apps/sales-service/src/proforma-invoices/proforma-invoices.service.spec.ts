import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  ProformaInvoiceStatus,
  ProformaSourceType,
  QuotationStatus,
} from '../../generated/prisma-client';
import { ProformaInvoicesService } from './proforma-invoices.service';

describe('ProformaInvoicesService', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const actor = {
    userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    tenantId,
  };
  const productId = '33333333-3333-4333-8333-333333333333';
  const unitOfMeasureId = '99999999-9999-4999-8999-999999999999';
  const altUnitOfMeasureId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const taxCodeId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  function zeroTotals() {
    return {
      subtotal: { toFixed: () => '0.0000' },
      discountTotal: { toFixed: () => '0.0000' },
      taxTotal: { toFixed: () => '0.0000' },
      total: { toFixed: () => '0.0000' },
    };
  }

  function defaultUomOptions(overrides: Record<string, unknown> = {}) {
    return {
      productId,
      trackInventory: true,
      base: { unitOfMeasureId, code: 'EA', name: 'Each' },
      alternatives: [],
      ...overrides,
    };
  }

  function defaultInventoryProducts(
    overrides: Partial<{ getUomOptions: jest.Mock }> = {},
  ) {
    return {
      getUomOptions: jest.fn().mockResolvedValue(defaultUomOptions()),
      ...overrides,
    };
  }

  function defaultAccountingTaxCodes(
    overrides: Partial<{ getById: jest.Mock }> = {},
  ) {
    return {
      getById: jest.fn(),
      ...overrides,
    };
  }

  function taxCodeResponse(overrides: Record<string, unknown> = {}) {
    return {
      id: taxCodeId,
      code: 'GST18',
      name: 'GST 18%',
      description: null,
      isActive: true,
      components: [
        { id: 'comp-1', sequence: 1, type: 'CGST', name: null, rate: '9.0000' },
        { id: 'comp-2', sequence: 2, type: 'SGST', name: null, rate: '9.0000' },
      ],
      ...overrides,
    };
  }

  function createService(
    deps: {
      prisma?: unknown;
      audit?: unknown;
      inventoryProducts?: unknown;
      accountingTaxCodes?: unknown;
    } = {},
  ) {
    return new ProformaInvoicesService(
      (deps.prisma ?? {}) as never,
      (deps.audit ?? { record: jest.fn().mockResolvedValue(undefined) }) as never,
      (deps.inventoryProducts ?? defaultInventoryProducts()) as never,
      (deps.accountingTaxCodes ?? defaultAccountingTaxCodes()) as never,
    );
  }

  function baseItemInput(overrides: Record<string, unknown> = {}) {
    return {
      productId,
      productSku: 'SKU-1',
      productName: 'Widget',
      quantity: '10',
      unitOfMeasureId,
      unitPrice: '5.0000',
      ...overrides,
    };
  }

  /** A QuotationItem/SalesOrderItem-shaped source row, with UOM/discount/tax fields and taxComponents. */
  function sourceItem(overrides: Record<string, unknown> = {}) {
    return {
      productId: 'p1',
      productSku: 'SKU',
      productName: 'Widget',
      quantity: { toFixed: () => '1.000000', toString: () => '1' },
      unitOfMeasureId: 'unit-ea',
      uomCode: 'EA',
      uomName: 'Each',
      conversionFactor: { toFixed: () => '1.000000' },
      unitPrice: { toFixed: () => '10.0000', toString: () => '10' },
      discountPercent: { toFixed: () => '10.00' },
      discountAmount: { toFixed: () => '1.0000' },
      taxCodeId: 'tax-1',
      taxCode: 'GST18',
      taxCodeName: 'GST 18%',
      taxAmount: { toFixed: () => '1.6200' },
      lineSubtotal: { toFixed: () => '9.0000' },
      lineTotal: { toFixed: () => '10.6200' },
      taxComponents: [
        {
          sequence: 1,
          type: 'CGST',
          name: null,
          rate: { toFixed: () => '9.0000' },
          componentTaxAmount: { toFixed: () => '0.8100' },
        },
        {
          sequence: 2,
          type: 'SGST',
          name: null,
          rate: { toFixed: () => '9.0000' },
          componentTaxAmount: { toFixed: () => '0.8100' },
        },
      ],
      ...overrides,
    };
  }

  function createdItemRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'pfi1',
      tenantId,
      proformaInvoiceId: 'pf1',
      productId: 'p1',
      productSku: 'SKU',
      productName: 'Widget',
      quantity: { toFixed: () => '1.000000' },
      unitOfMeasureId: 'unit-ea',
      uomCode: 'EA',
      uomName: 'Each',
      conversionFactor: { toFixed: () => '1.000000' },
      unitPrice: { toFixed: () => '10.0000' },
      discountPercent: { toFixed: () => '10.00' },
      discountAmount: { toFixed: () => '1.0000' },
      taxCodeId: 'tax-1',
      taxCode: 'GST18',
      taxCodeName: 'GST 18%',
      taxAmount: { toFixed: () => '1.6200' },
      lineSubtotal: { toFixed: () => '9.0000' },
      lineTotal: { toFixed: () => '10.6200' },
      createdAt: new Date(),
      updatedAt: new Date(),
      taxComponents: [],
      ...overrides,
    };
  }

  function createdRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'pf1',
      tenantId,
      documentNumber: 'PF-00000001',
      sourceType: ProformaSourceType.QUOTATION,
      sourceId: 'q1',
      status: ProformaInvoiceStatus.DRAFT,
      customerId: 'c1',
      customerName: 'Acme',
      billingAddress: 'B',
      shippingAddress: 'S',
      notes: null,
      subtotal: { toFixed: () => '10.0000' },
      discountTotal: { toFixed: () => '1.0000' },
      taxTotal: { toFixed: () => '1.6200' },
      total: { toFixed: () => '10.6200' },
      issuedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [createdItemRow()],
      ...overrides,
    };
  }

  it('creates DRAFT proforma from SENT quotation and copies UOM/discount/tax snapshot fields verbatim', async () => {
    const item = sourceItem();
    const quotation = {
      id: 'q1',
      tenantId,
      status: QuotationStatus.SENT,
      customerId: 'c1',
      customerName: 'Acme',
      billingAddress: 'B',
      shippingAddress: 'S',
      notes: null,
      subtotal: { toString: () => '10' },
      discountTotal: { toString: () => '1' },
      taxTotal: { toString: () => '1.62' },
      total: { toString: () => '10.62' },
      items: [item],
    };
    const created = createdRow({ documentNumber: 'PF-00000001' });
    const createMock = jest.fn().mockResolvedValue(created);
    const prisma = {
      quotation: { findFirst: jest.fn().mockResolvedValue(quotation) },
      proformaInvoice: {
        count: jest.fn().mockResolvedValue(0),
        create: createMock,
      },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = createService({ prisma, audit });

    const result = await service.createFromQuotation(actor, 'q1');
    expect(result.documentNumber).toBe('PF-00000001');
    expect(result.sourceType).toBe(ProformaSourceType.QUOTATION);
    expect(result.sourceId).toBe('q1');
    expect(result.status).toBe(ProformaInvoiceStatus.DRAFT);
    expect(createMock.mock.calls[0][0].data.status).toBe(
      ProformaInvoiceStatus.DRAFT,
    );
    expect(createMock.mock.calls[0][0].data.issuedAt).toBeUndefined();

    const data = createMock.mock.calls[0][0].data;
    // header totals copied verbatim (same object references, not recalculated)
    expect(data.discountTotal).toBe(quotation.discountTotal);
    expect(data.taxTotal).toBe(quotation.taxTotal);

    // item snapshot fields copied verbatim
    const createdItem = data.items.create[0];
    expect(createdItem.unitOfMeasureId).toBe(item.unitOfMeasureId);
    expect(createdItem.uomCode).toBe(item.uomCode);
    expect(createdItem.uomName).toBe(item.uomName);
    expect(createdItem.conversionFactor).toBe(item.conversionFactor);
    expect(createdItem.discountPercent).toBe(item.discountPercent);
    expect(createdItem.discountAmount).toBe(item.discountAmount);
    expect(createdItem.taxCodeId).toBe(item.taxCodeId);
    expect(createdItem.taxCode).toBe(item.taxCode);
    expect(createdItem.taxCodeName).toBe(item.taxCodeName);
    expect(createdItem.taxAmount).toBe(item.taxAmount);
    expect(createdItem.lineSubtotal).toBe(item.lineSubtotal);

    // tax component snapshot rows copied verbatim, not recalculated
    expect(createdItem.taxComponents.create).toHaveLength(2);
    expect(createdItem.taxComponents.create[0].rate).toBe(
      item.taxComponents[0].rate,
    );
    expect(createdItem.taxComponents.create[0].componentTaxAmount).toBe(
      item.taxComponents[0].componentTaxAmount,
    );
    expect(createdItem.taxComponents.create[1].type).toBe(
      item.taxComponents[1].type,
    );

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'proforma-invoice.created' }),
    );
  });

  it('rejects proforma from DRAFT quotation', async () => {
    const prisma = {
      quotation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'q1',
          tenantId,
          status: QuotationStatus.DRAFT,
          items: [{ id: 'i1' }],
        }),
      },
    };
    const service = createService({ prisma });
    await expect(
      service.createFromQuotation(actor, 'q1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns 404 for missing quotation in tenant', async () => {
    const prisma = {
      quotation: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = createService({ prisma });
    await expect(
      service.createFromQuotation(actor, 'q1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates DRAFT proforma from sales order via shared snapshot path and copies its UOM/discount/tax fields verbatim', async () => {
    const item = sourceItem();
    const order = {
      id: 'so1',
      tenantId,
      status: 'CONFIRMED',
      customerId: 'c1',
      customerName: 'Acme',
      billingAddress: 'B',
      shippingAddress: 'S',
      notes: null,
      subtotal: { toString: () => '10' },
      discountTotal: { toString: () => '1' },
      taxTotal: { toString: () => '1.62' },
      total: { toString: () => '10.62' },
      items: [item],
    };
    const created = createdRow({
      id: 'pf2',
      documentNumber: 'PF-00000002',
      sourceType: ProformaSourceType.SALES_ORDER,
      sourceId: 'so1',
    });
    const createMock = jest.fn().mockResolvedValue(created);
    const prisma = {
      salesOrder: { findFirst: jest.fn().mockResolvedValue(order) },
      proformaInvoice: {
        count: jest.fn().mockResolvedValue(1),
        create: createMock,
      },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = createService({ prisma, audit });
    const result = await service.createFromSalesOrder(actor, 'so1');
    expect(result.sourceType).toBe(ProformaSourceType.SALES_ORDER);
    expect(result.sourceId).toBe('so1');
    expect(result.documentNumber).toBe('PF-00000002');
    expect(result.status).toBe(ProformaInvoiceStatus.DRAFT);

    const data = createMock.mock.calls[0][0].data;
    expect(data.discountTotal).toBe(order.discountTotal);
    expect(data.taxTotal).toBe(order.taxTotal);
    const createdItem = data.items.create[0];
    expect(createdItem.unitOfMeasureId).toBe(item.unitOfMeasureId);
    expect(createdItem.taxCodeId).toBe(item.taxCodeId);
    expect(createdItem.taxComponents.create).toHaveLength(2);
  });

  describe('getById', () => {
    it('returns the persisted source document on a quotation-created proforma', async () => {
      const row = createdRow({
        sourceType: ProformaSourceType.QUOTATION,
        sourceId: 'q1',
      });
      const prisma = {
        proformaInvoice: { findFirst: jest.fn().mockResolvedValue(row) },
      };
      const service = createService({ prisma });
      const result = await service.getById(actor, 'pf1');
      expect(result.sourceType).toBe(ProformaSourceType.QUOTATION);
      expect(result.sourceId).toBe('q1');
    });

    it('returns the persisted source document on a sales-order-created proforma', async () => {
      const row = createdRow({
        sourceType: ProformaSourceType.SALES_ORDER,
        sourceId: 'so1',
      });
      const prisma = {
        proformaInvoice: { findFirst: jest.fn().mockResolvedValue(row) },
      };
      const service = createService({ prisma });
      const result = await service.getById(actor, 'pf1');
      expect(result.sourceType).toBe(ProformaSourceType.SALES_ORDER);
      expect(result.sourceId).toBe('so1');
    });
  });

  describe('update', () => {
    const draftRow = {
      id: 'pf1',
      tenantId,
      status: ProformaInvoiceStatus.DRAFT,
      sourceType: ProformaSourceType.QUOTATION,
      sourceId: 'q1',
      items: [{ id: 'i1' }],
    };

    it('rejects when not DRAFT', async () => {
      const prisma = {
        proformaInvoice: {
          findFirst: jest.fn().mockResolvedValue({
            ...draftRow,
            status: ProformaInvoiceStatus.ISSUED,
          }),
        },
      };
      const service = createService({ prisma });
      await expect(
        service.update(actor, 'pf1', { notes: 'x' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects when no fields to update', async () => {
      const prisma = {
        proformaInvoice: { findFirst: jest.fn().mockResolvedValue(draftRow) },
      };
      const service = createService({ prisma });
      await expect(service.update(actor, 'pf1', {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('updates header fields on a DRAFT proforma and returns the unchanged source document', async () => {
      const updated = {
        ...draftRow,
        notes: 'updated',
        billingAddress: 'New billing',
        shippingAddress: null,
        ...zeroTotals(),
        items: [createdItemRow()],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const updateMock = jest.fn().mockResolvedValue(updated);
      const tx = { proformaInvoice: { update: updateMock } };
      const prisma = {
        proformaInvoice: { findFirst: jest.fn().mockResolvedValue(draftRow) },
        $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)),
      };
      const audit = { record: jest.fn().mockResolvedValue(undefined) };
      const service = createService({ prisma, audit });
      const result = await service.update(actor, 'pf1', {
        notes: 'updated',
        billingAddress: 'New billing',
        shippingAddress: null,
      });
      expect(result.notes).toBe('updated');
      expect(result.sourceType).toBe(ProformaSourceType.QUOTATION);
      expect(result.sourceId).toBe('q1');
      // sourceType/sourceId are never part of the update payload sent to Prisma
      const data = updateMock.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('sourceType');
      expect(data).not.toHaveProperty('sourceId');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'proforma-invoice.updated' }),
      );
    });

    it('ignores sourceType/sourceId even if present on the update DTO — source cannot be changed via edit', async () => {
      const updated = {
        ...draftRow,
        notes: 'updated',
        ...zeroTotals(),
        items: [createdItemRow()],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const updateMock = jest.fn().mockResolvedValue(updated);
      const tx = { proformaInvoice: { update: updateMock } };
      const prisma = {
        proformaInvoice: { findFirst: jest.fn().mockResolvedValue(draftRow) },
        $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)),
      };
      const service = createService({ prisma });

      // UpdateProformaInvoiceDto has no sourceType/sourceId fields; this
      // simulates a malicious/legacy caller smuggling them in anyway.
      const dto = {
        notes: 'updated',
        sourceType: ProformaSourceType.SALES_ORDER,
        sourceId: 'so-hijack',
      } as unknown as Parameters<typeof service.update>[2];

      const result = await service.update(actor, 'pf1', dto);

      expect(result.sourceType).toBe(ProformaSourceType.QUOTATION);
      expect(result.sourceId).toBe('q1');
      const data = updateMock.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('sourceType');
      expect(data).not.toHaveProperty('sourceId');
    });

    it('recomputes discountTotal/taxTotal from the replaced items and persists nested taxComponents via per-item create', async () => {
      const updated = {
        ...draftRow,
        notes: null,
        ...zeroTotals(),
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const updateMock = jest.fn().mockResolvedValue(updated);
      const createItemMock = jest.fn().mockResolvedValue(undefined);
      const tx = {
        proformaInvoice: { update: updateMock },
        proformaInvoiceItem: {
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
          create: createItemMock,
        },
      };
      const prisma = {
        proformaInvoice: { findFirst: jest.fn().mockResolvedValue(draftRow) },
        $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)),
      };
      const accountingTaxCodes = defaultAccountingTaxCodes({
        getById: jest.fn().mockResolvedValue(taxCodeResponse()),
      });
      const service = createService({ prisma, accountingTaxCodes });

      await service.update(actor, 'pf1', {
        items: [
          baseItemInput({
            quantity: '10',
            unitPrice: '5.0000',
            discountPercent: '10',
            taxCodeId,
          }),
        ],
      });

      expect(createItemMock).toHaveBeenCalledTimes(1);
      const itemData = createItemMock.mock.calls[0][0].data;
      expect(itemData.taxComponents.create).toHaveLength(2);
      const data = updateMock.mock.calls[0][0].data;
      // gross = 50; discount 10% = 5; lineSubtotal = 45; tax 18% of 45 = 8.1
      expect(data.discountTotal.toFixed(4)).toBe('5.0000');
      expect(data.taxTotal.toFixed(4)).toBe('8.1000');
      expect(data.total.toFixed(4)).toBe('53.1000');
    });

    it('defaults discountPercent to 0 and taxAmount to 0 when neither is provided on update', async () => {
      const updated = {
        ...draftRow,
        notes: null,
        ...zeroTotals(),
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const tx = {
        proformaInvoice: { update: jest.fn().mockResolvedValue(updated) },
        proformaInvoiceItem: {
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
          create: jest.fn().mockResolvedValue(undefined),
        },
      };
      const prisma = {
        proformaInvoice: { findFirst: jest.fn().mockResolvedValue(draftRow) },
        $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)),
      };
      const service = createService({ prisma });

      await service.update(actor, 'pf1', {
        items: [baseItemInput({ quantity: '10', unitPrice: '5.0000' })],
      });

      const itemData = (tx.proformaInvoiceItem.create as jest.Mock).mock
        .calls[0][0].data;
      expect(itemData.discountPercent.toFixed(2)).toBe('0.00');
      expect(itemData.discountAmount.toFixed(4)).toBe('0.0000');
      expect(itemData.taxAmount.toFixed(4)).toBe('0.0000');
      expect(itemData.taxCodeId).toBeNull();
      expect(itemData.taxComponents.create).toEqual([]);
    });

    it('snapshots productTracksInventory from inventory-service (Phase 3.3)', async () => {
      const updated = {
        ...draftRow,
        notes: null,
        ...zeroTotals(),
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const tx = {
        proformaInvoice: { update: jest.fn().mockResolvedValue(updated) },
        proformaInvoiceItem: {
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
          create: jest.fn().mockResolvedValue(undefined),
        },
      };
      const prisma = {
        proformaInvoice: { findFirst: jest.fn().mockResolvedValue(draftRow) },
        $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)),
      };
      const inventoryProducts = defaultInventoryProducts({
        getUomOptions: jest
          .fn()
          .mockResolvedValue(defaultUomOptions({ trackInventory: false })),
      });
      const service = createService({ prisma, inventoryProducts });

      await service.update(actor, 'pf1', {
        items: [baseItemInput({ quantity: '10', unitPrice: '5.0000' })],
      });

      const itemData = (tx.proformaInvoiceItem.create as jest.Mock).mock
        .calls[0][0].data;
      expect(itemData.productTracksInventory).toBe(false);
    });

    it('rejects a unitOfMeasureId that is neither the base unit nor an active alternative', async () => {
      const prisma = {
        proformaInvoice: { findFirst: jest.fn().mockResolvedValue(draftRow) },
        $transaction: jest.fn((fn: (tx: unknown) => unknown) =>
          fn({
            proformaInvoiceItem: {
              deleteMany: jest.fn(),
              create: jest.fn(),
            },
          }),
        ),
      };
      const service = createService({ prisma });

      await expect(
        service.update(actor, 'pf1', {
          items: [
            baseItemInput({ unitOfMeasureId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' }),
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts an active ProductUnit alternative and snapshots its conversionFactor on update', async () => {
      const updated = {
        ...draftRow,
        notes: null,
        ...zeroTotals(),
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const tx = {
        proformaInvoice: { update: jest.fn().mockResolvedValue(updated) },
        proformaInvoiceItem: {
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
          create: jest.fn().mockResolvedValue(undefined),
        },
      };
      const prisma = {
        proformaInvoice: { findFirst: jest.fn().mockResolvedValue(draftRow) },
        $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)),
      };
      const inventoryProducts = defaultInventoryProducts({
        getUomOptions: jest.fn().mockResolvedValue(
          defaultUomOptions({
            alternatives: [
              {
                unitOfMeasureId: altUnitOfMeasureId,
                code: 'BOX',
                name: 'Box of 12',
                conversionFactor: '12.000000',
                sellingPrice: '90.0000',
              },
            ],
          }),
        ),
      });
      const service = createService({ prisma, inventoryProducts });

      await service.update(actor, 'pf1', {
        items: [baseItemInput({ unitOfMeasureId: altUnitOfMeasureId })],
      });

      const itemData = (tx.proformaInvoiceItem.create as jest.Mock).mock
        .calls[0][0].data;
      expect(itemData.unitOfMeasureId).toBe(altUnitOfMeasureId);
      expect(itemData.uomCode).toBe('BOX');
      expect(itemData.conversionFactor.toFixed(6)).toBe('12.000000');
    });

    it('rounds gross using HALF_UP to 4 decimal places on update', async () => {
      const updated = {
        ...draftRow,
        notes: null,
        ...zeroTotals(),
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const tx = {
        proformaInvoice: { update: jest.fn().mockResolvedValue(updated) },
        proformaInvoiceItem: {
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
          create: jest.fn().mockResolvedValue(undefined),
        },
      };
      const prisma = {
        proformaInvoice: { findFirst: jest.fn().mockResolvedValue(draftRow) },
        $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)),
      };
      const service = createService({ prisma });

      await service.update(actor, 'pf1', {
        items: [baseItemInput({ quantity: '1.5', unitPrice: '3.3335' })],
      });

      const itemData = (tx.proformaInvoiceItem.create as jest.Mock).mock
        .calls[0][0].data;
      // 1.5 * 3.3335 = 5.00025 -> HALF_UP to 4dp = 5.0003
      expect(itemData.lineSubtotal.toFixed(4)).toBe('5.0003');
      expect(itemData.lineTotal.toFixed(4)).toBe('5.0003');
    });

    it('propagates a 404 when the product/UOM cannot be resolved', async () => {
      const prisma = {
        proformaInvoice: { findFirst: jest.fn().mockResolvedValue(draftRow) },
      };
      const inventoryProducts = defaultInventoryProducts({
        getUomOptions: jest
          .fn()
          .mockRejectedValue(new NotFoundException('Product not found')),
      });
      const service = createService({ prisma, inventoryProducts });

      await expect(
        service.update(actor, 'pf1', { items: [baseItemInput()] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('propagates a 404 when the selected tax code cannot be resolved', async () => {
      const prisma = {
        proformaInvoice: { findFirst: jest.fn().mockResolvedValue(draftRow) },
      };
      const accountingTaxCodes = defaultAccountingTaxCodes({
        getById: jest
          .fn()
          .mockRejectedValue(new NotFoundException('Tax code not found')),
      });
      const service = createService({ prisma, accountingTaxCodes });

      await expect(
        service.update(actor, 'pf1', {
          items: [baseItemInput({ taxCodeId })],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('computes document discountTotal/taxTotal/total across multiple lines on update', async () => {
      const updated = {
        ...draftRow,
        notes: null,
        ...zeroTotals(),
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const updateMock = jest.fn().mockResolvedValue(updated);
      const tx = {
        proformaInvoice: { update: updateMock },
        proformaInvoiceItem: {
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
          create: jest.fn().mockResolvedValue(undefined),
        },
      };
      const prisma = {
        proformaInvoice: { findFirst: jest.fn().mockResolvedValue(draftRow) },
        $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)),
      };
      const accountingTaxCodes = defaultAccountingTaxCodes({
        getById: jest.fn().mockResolvedValue(
          taxCodeResponse({
            components: [
              { id: 'comp-1', sequence: 1, type: 'CGST', name: null, rate: '9.0000' },
            ],
          }),
        ),
      });
      const service = createService({ prisma, accountingTaxCodes });

      await service.update(actor, 'pf1', {
        items: [
          baseItemInput({ quantity: '10', unitPrice: '5.0000' }),
          baseItemInput({
            quantity: '2',
            unitPrice: '25.0000',
            discountPercent: '10',
            taxCodeId,
          }),
        ],
      });

      const data = updateMock.mock.calls[0][0].data;
      expect(data.subtotal.toFixed(4)).toBe('100.0000');
      expect(data.discountTotal.toFixed(4)).toBe('5.0000');
      expect(data.taxTotal.toFixed(4)).toBe('4.0500');
      expect(data.total.toFixed(4)).toBe('99.0500');
    });
  });

  describe('send', () => {
    it('transitions DRAFT to ISSUED', async () => {
      const draftRow = {
        id: 'pf1',
        tenantId,
        status: ProformaInvoiceStatus.DRAFT,
        items: [{ id: 'i1' }],
      };
      const issuedRow = {
        ...draftRow,
        status: ProformaInvoiceStatus.ISSUED,
        issuedAt: new Date(),
        ...zeroTotals(),
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const updateMock = jest.fn().mockResolvedValue(issuedRow);
      const prisma = {
        proformaInvoice: {
          findFirst: jest.fn().mockResolvedValue(draftRow),
          update: updateMock,
        },
      };
      const audit = { record: jest.fn().mockResolvedValue(undefined) };
      const service = createService({ prisma, audit });
      const result = await service.send(actor, 'pf1');
      expect(result.status).toBe(ProformaInvoiceStatus.ISSUED);
      expect(updateMock.mock.calls[0][0].data.status).toBe(
        ProformaInvoiceStatus.ISSUED,
      );
    });

    it('rejects sending a non-DRAFT proforma', async () => {
      const prisma = {
        proformaInvoice: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'pf1',
            tenantId,
            status: ProformaInvoiceStatus.ISSUED,
            items: [{ id: 'i1' }],
          }),
        },
      };
      const service = createService({ prisma });
      await expect(service.send(actor, 'pf1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects sending a proforma with no items', async () => {
      const prisma = {
        proformaInvoice: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'pf1',
            tenantId,
            status: ProformaInvoiceStatus.DRAFT,
            items: [],
          }),
        },
      };
      const service = createService({ prisma });
      await expect(service.send(actor, 'pf1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('cancel', () => {
    it.each([ProformaInvoiceStatus.DRAFT, ProformaInvoiceStatus.ISSUED])(
      'cancels from %s',
      async (status) => {
        const row = { id: 'pf1', tenantId, status, items: [] };
        const cancelled = {
          ...row,
          status: ProformaInvoiceStatus.CANCELLED,
          ...zeroTotals(),
          issuedAt: null,
          items: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        const prisma = {
          proformaInvoice: {
            findFirst: jest.fn().mockResolvedValue(row),
            update: jest.fn().mockResolvedValue(cancelled),
          },
        };
        const audit = { record: jest.fn().mockResolvedValue(undefined) };
        const service = createService({ prisma, audit });
        const result = await service.cancel(actor, 'pf1');
        expect(result.status).toBe(ProformaInvoiceStatus.CANCELLED);
      },
    );

    it('rejects cancelling an already-CANCELLED proforma', async () => {
      const prisma = {
        proformaInvoice: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'pf1',
            tenantId,
            status: ProformaInvoiceStatus.CANCELLED,
            items: [],
          }),
        },
      };
      const service = createService({ prisma });
      await expect(service.cancel(actor, 'pf1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });
});
