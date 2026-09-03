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

  it('creates DRAFT proforma from SENT quotation with document number', async () => {
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
      status: ProformaInvoiceStatus.DRAFT,
      customerId: 'c1',
      customerName: 'Acme',
      billingAddress: 'B',
      shippingAddress: 'S',
      notes: null,
      subtotal: { toFixed: () => '10.0000' },
      total: { toFixed: () => '10.0000' },
      issuedAt: null,
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

  it('creates DRAFT proforma from sales order via shared snapshot path', async () => {
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
      status: ProformaInvoiceStatus.DRAFT,
      customerId: 'c1',
      customerName: 'Acme',
      billingAddress: 'B',
      shippingAddress: 'S',
      notes: null,
      subtotal: { toFixed: () => '10.0000' },
      total: { toFixed: () => '10.0000' },
      issuedAt: null,
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
    expect(result.status).toBe(ProformaInvoiceStatus.DRAFT);
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
        subtotal: { toFixed: () => '10.0000' },
        total: { toFixed: () => '10.0000' },
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
        subtotal: { toFixed: () => '10.0000' },
        total: { toFixed: () => '10.0000' },
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
          subtotal: { toFixed: () => '0.0000' },
          total: { toFixed: () => '0.0000' },
          issuedAt: null,
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
