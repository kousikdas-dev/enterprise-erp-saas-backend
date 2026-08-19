import { ConflictException, NotFoundException } from '@nestjs/common';
import {
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

  it('creates ISSUED proforma from SENT quotation with document number', async () => {
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
      total: { toString: () => '10' },
      items: [
        {
          productId: 'p1',
          productSku: 'SKU',
          productName: 'Widget',
          quantity: { toFixed: () => '1.000000', toString: () => '1' },
          unitPrice: { toFixed: () => '10.0000', toString: () => '10' },
          lineTotal: { toFixed: () => '10.0000', toString: () => '10' },
        },
      ],
    };
    const created = {
      id: 'pf1',
      tenantId,
      documentNumber: 'PF-00000001',
      sourceType: ProformaSourceType.QUOTATION,
      sourceId: 'q1',
      status: 'ISSUED',
      customerId: 'c1',
      customerName: 'Acme',
      billingAddress: 'B',
      shippingAddress: 'S',
      notes: null,
      subtotal: { toFixed: () => '10.0000' },
      total: { toFixed: () => '10.0000' },
      issuedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [
        {
          id: 'pfi1',
          tenantId,
          proformaInvoiceId: 'pf1',
          productId: 'p1',
          productSku: 'SKU',
          productName: 'Widget',
          quantity: { toFixed: () => '1.000000' },
          unitPrice: { toFixed: () => '10.0000' },
          lineTotal: { toFixed: () => '10.0000' },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    };
    const prisma = {
      quotation: { findFirst: jest.fn().mockResolvedValue(quotation) },
      proformaInvoice: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue(created),
      },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new ProformaInvoicesService(prisma as never, audit as never);

    const result = await service.createFromQuotation(actor, 'q1');
    expect(result.documentNumber).toBe('PF-00000001');
    expect(result.sourceType).toBe(ProformaSourceType.QUOTATION);
    expect(result.sourceId).toBe('q1');
    expect(result.status).toBe('ISSUED');
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

  it('creates ISSUED proforma from sales order via shared snapshot path', async () => {
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
      total: { toString: () => '10' },
      items: [
        {
          productId: 'p1',
          productSku: 'SKU',
          productName: 'Widget',
          quantity: { toFixed: () => '1.000000', toString: () => '1' },
          unitPrice: { toFixed: () => '10.0000', toString: () => '10' },
          lineTotal: { toFixed: () => '10.0000', toString: () => '10' },
        },
      ],
    };
    const created = {
      id: 'pf2',
      tenantId,
      documentNumber: 'PF-00000002',
      sourceType: ProformaSourceType.SALES_ORDER,
      sourceId: 'so1',
      status: 'ISSUED',
      customerId: 'c1',
      customerName: 'Acme',
      billingAddress: 'B',
      shippingAddress: 'S',
      notes: null,
      subtotal: { toFixed: () => '10.0000' },
      total: { toFixed: () => '10.0000' },
      issuedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [
        {
          id: 'pfi2',
          tenantId,
          proformaInvoiceId: 'pf2',
          productId: 'p1',
          productSku: 'SKU',
          productName: 'Widget',
          quantity: { toFixed: () => '1.000000' },
          unitPrice: { toFixed: () => '10.0000' },
          lineTotal: { toFixed: () => '10.0000' },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    };
    const prisma = {
      salesOrder: { findFirst: jest.fn().mockResolvedValue(order) },
      proformaInvoice: {
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockResolvedValue(created),
      },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new ProformaInvoicesService(prisma as never, audit as never);
    const result = await service.createFromSalesOrder(actor, 'so1');
    expect(result.sourceType).toBe(ProformaSourceType.SALES_ORDER);
    expect(result.sourceId).toBe('so1');
    expect(result.documentNumber).toBe('PF-00000002');
  });
});
