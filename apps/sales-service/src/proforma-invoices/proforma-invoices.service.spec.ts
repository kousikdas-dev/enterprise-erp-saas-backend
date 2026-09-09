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

  function zeroTotals() {
    return {
      subtotal: { toFixed: () => '0.0000' },
      discountTotal: { toFixed: () => '0.0000' },
      taxTotal: { toFixed: () => '0.0000' },
      total: { toFixed: () => '0.0000' },
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
    const service = new ProformaInvoicesService(prisma as never, audit as never);

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
    const service = new ProformaInvoicesService(
      prisma as never,
      { record: jest.fn() } as never,
    );
    await expect(
      service.createFromQuotation(actor, 'q1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns 404 for missing quotation in tenant', async () => {
    const prisma = {
      quotation: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new ProformaInvoicesService(
      prisma as never,
      { record: jest.fn() } as never,
    );
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
    const service = new ProformaInvoicesService(prisma as never, audit as never);
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

  describe('update', () => {
    const draftRow = {
      id: 'pf1',
      tenantId,
      status: ProformaInvoiceStatus.DRAFT,
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
      const service = new ProformaInvoicesService(
        prisma as never,
        { record: jest.fn() } as never,
      );
      await expect(
        service.update(actor, 'pf1', { notes: 'x' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects when no fields to update', async () => {
      const prisma = {
        proformaInvoice: { findFirst: jest.fn().mockResolvedValue(draftRow) },
      };
      const service = new ProformaInvoicesService(
        prisma as never,
        { record: jest.fn() } as never,
      );
      await expect(service.update(actor, 'pf1', {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('updates header fields on a DRAFT proforma', async () => {
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
      const tx = { proformaInvoice: { update: jest.fn().mockResolvedValue(updated) } };
      const prisma = {
        proformaInvoice: { findFirst: jest.fn().mockResolvedValue(draftRow) },
        $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)),
      };
      const audit = { record: jest.fn().mockResolvedValue(undefined) };
      const service = new ProformaInvoicesService(prisma as never, audit as never);
      const result = await service.update(actor, 'pf1', {
        notes: 'updated',
        billingAddress: 'New billing',
        shippingAddress: null,
      });
      expect(result.notes).toBe('updated');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'proforma-invoice.updated' }),
      );
    });

    it('resets discountTotal/taxTotal to 0 when items are manually replaced', async () => {
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
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      const prisma = {
        proformaInvoice: { findFirst: jest.fn().mockResolvedValue(draftRow) },
        $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)),
      };
      const service = new ProformaInvoicesService(
        prisma as never,
        { record: jest.fn().mockResolvedValue(undefined) } as never,
      );

      await service.update(actor, 'pf1', {
        items: [
          {
            productId: 'p1',
            productSku: 'SKU',
            productName: 'Widget',
            quantity: '1',
            unitPrice: '10.0000',
          },
        ],
      });

      const data = updateMock.mock.calls[0][0].data;
      expect(data.discountTotal.toFixed(4)).toBe('0.0000');
      expect(data.taxTotal.toFixed(4)).toBe('0.0000');
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
      const service = new ProformaInvoicesService(prisma as never, audit as never);
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
      const service = new ProformaInvoicesService(
        prisma as never,
        { record: jest.fn() } as never,
      );
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
      const service = new ProformaInvoicesService(
        prisma as never,
        { record: jest.fn() } as never,
      );
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
        const service = new ProformaInvoicesService(prisma as never, audit as never);
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
      const service = new ProformaInvoicesService(
        prisma as never,
        { record: jest.fn() } as never,
      );
      await expect(service.cancel(actor, 'pf1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });
});
