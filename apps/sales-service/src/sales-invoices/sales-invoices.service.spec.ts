import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { of } from 'rxjs';
import {
  ProformaInvoiceStatus,
  SalesInvoiceSourceType,
  SalesInvoiceStatus,
  SalesOrderStatus,
} from '../../generated/prisma-client';
import { SalesInvoicesService } from './sales-invoices.service';

describe('SalesInvoicesService', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const actor = {
    userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    tenantId,
  };

  const customer = {
    id: 'c1',
    tenantId,
    name: 'Acme',
    paymentTermId: 'pt-default',
    salespersonId: 'sp-default',
    street: '1 Main St',
    street2: null,
    city: 'Metropolis',
    zip: '00000',
    state: 'NY',
    country: 'US',
  };

  // ClientProxy.emit() returns a cold Observable; the service subscribes to it via
  // firstValueFrom(), so the mock must return a real Observable, not a plain value.
  function makeEventBus() {
    return { emit: jest.fn().mockReturnValue(of(undefined)) };
  }

  const invoiceItem = {
    id: 'sii1',
    tenantId,
    salesInvoiceId: 'inv1',
    productId: 'p1',
    productSku: 'SKU',
    productName: 'Widget',
    quantity: { toFixed: () => '1.000000' },
    unitPrice: { toFixed: () => '10.0000' },
    lineTotal: { toFixed: () => '10.0000' },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('create (manual)', () => {
    it('creates a DRAFT invoice with a generated invoice number, defaulting payment term / salesperson from the customer', async () => {
      const created = {
        id: 'inv1',
        tenantId,
        invoiceNumber: 'INV-00000001',
        sourceType: null,
        sourceId: null,
        status: SalesInvoiceStatus.DRAFT,
        customerId: 'c1',
        customerName: 'Acme',
        billingAddress: '1 Main St, Metropolis, NY, 00000, US',
        shippingAddress: '1 Main St, Metropolis, NY, 00000, US',
        paymentTermId: 'pt-default',
        salespersonId: 'sp-default',
        invoiceDate: new Date(),
        dueDate: null,
        notes: null,
        subtotal: { toFixed: () => '10.0000' },
        total: { toFixed: () => '10.0000' },
        sentAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [invoiceItem],
      };
      const createMock = jest.fn().mockResolvedValue(created);
      const prisma = {
        salesInvoice: { count: jest.fn().mockResolvedValue(0), create: createMock },
      };
      const customers = { require: jest.fn().mockResolvedValue(customer) };
      const audit = { record: jest.fn().mockResolvedValue(undefined) };
      const service = new SalesInvoicesService(
        prisma as never,
        customers as never,
        audit as never,
        makeEventBus() as never,
      );

      const result = await service.create(actor, {
        customerId: 'c1',
        items: [
          {
            productId: 'p1',
            productSku: 'SKU',
            productName: 'Widget',
            quantity: '1',
            unitPrice: '10',
          },
        ],
      });

      expect(result.invoiceNumber).toBe('INV-00000001');
      expect(result.status).toBe(SalesInvoiceStatus.DRAFT);
      expect(createMock.mock.calls[0][0].data.paymentTermId).toBe('pt-default');
      expect(createMock.mock.calls[0][0].data.salespersonId).toBe('sp-default');
      expect(createMock.mock.calls[0][0].data.sourceType).toBeNull();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'sales-invoice.created',
          metadata: expect.objectContaining({ source: 'manual' }),
        }),
      );
    });
  });

  describe('createFromSalesOrder', () => {
    const order = {
      id: 'so1',
      tenantId,
      status: SalesOrderStatus.CONFIRMED,
      customerId: 'c1',
      customerName: 'Acme',
      billingAddress: 'B',
      shippingAddress: 'S',
      notes: 'order notes',
      subtotal: { toString: () => '10' },
      total: { toString: () => '10' },
      items: [
        {
          productId: 'p1',
          productSku: 'SKU',
          productName: 'Widget',
          quantity: { toFixed: () => '1.000000' },
          unitPrice: { toFixed: () => '10.0000' },
          lineTotal: { toFixed: () => '10.0000' },
        },
      ],
    };

    it('creates a DRAFT invoice sourced from a non-CANCELLED sales order', async () => {
      const created = {
        id: 'inv2',
        tenantId,
        invoiceNumber: 'INV-00000002',
        sourceType: SalesInvoiceSourceType.SALES_ORDER,
        sourceId: 'so1',
        status: SalesInvoiceStatus.DRAFT,
        customerId: 'c1',
        customerName: 'Acme',
        billingAddress: 'B',
        shippingAddress: 'S',
        paymentTermId: 'pt-default',
        salespersonId: 'sp-default',
        invoiceDate: new Date(),
        dueDate: null,
        notes: 'order notes',
        subtotal: { toFixed: () => '10.0000' },
        total: { toFixed: () => '10.0000' },
        sentAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [invoiceItem],
      };
      const prisma = {
        salesOrder: { findFirst: jest.fn().mockResolvedValue(order) },
        salesInvoice: {
          count: jest.fn().mockResolvedValue(1),
          create: jest.fn().mockResolvedValue(created),
        },
      };
      const customers = { require: jest.fn().mockResolvedValue(customer) };
      const audit = { record: jest.fn().mockResolvedValue(undefined) };
      const service = new SalesInvoicesService(
        prisma as never,
        customers as never,
        audit as never,
        makeEventBus() as never,
      );

      const result = await service.createFromSalesOrder(actor, 'so1', {});
      expect(result.sourceType).toBe(SalesInvoiceSourceType.SALES_ORDER);
      expect(result.sourceId).toBe('so1');
    });

    it('rejects when the sales order is CANCELLED', async () => {
      const prisma = {
        salesOrder: {
          findFirst: jest.fn().mockResolvedValue({
            ...order,
            status: SalesOrderStatus.CANCELLED,
          }),
        },
      };
      const service = new SalesInvoicesService(
        prisma as never,
        { require: jest.fn() } as never,
        { record: jest.fn() } as never,
        makeEventBus() as never,
      );
      await expect(
        service.createFromSalesOrder(actor, 'so1', {}),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('returns 404 for a missing sales order in the tenant', async () => {
      const prisma = { salesOrder: { findFirst: jest.fn().mockResolvedValue(null) } };
      const service = new SalesInvoicesService(
        prisma as never,
        { require: jest.fn() } as never,
        { record: jest.fn() } as never,
        makeEventBus() as never,
      );
      await expect(
        service.createFromSalesOrder(actor, 'so1', {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createFromProformaInvoice', () => {
    const proforma = {
      id: 'pf1',
      tenantId,
      status: ProformaInvoiceStatus.ISSUED,
      customerId: 'c1',
      customerName: 'Acme',
      billingAddress: 'B',
      shippingAddress: 'S',
      notes: 'proforma notes',
      subtotal: { toString: () => '10' },
      total: { toString: () => '10' },
      items: [
        {
          productId: 'p1',
          productSku: 'SKU',
          productName: 'Widget',
          quantity: { toFixed: () => '1.000000' },
          unitPrice: { toFixed: () => '10.0000' },
          lineTotal: { toFixed: () => '10.0000' },
        },
      ],
    };

    it('creates a DRAFT invoice sourced from an ISSUED proforma invoice', async () => {
      const created = {
        id: 'inv3',
        tenantId,
        invoiceNumber: 'INV-00000003',
        sourceType: SalesInvoiceSourceType.PROFORMA_INVOICE,
        sourceId: 'pf1',
        status: SalesInvoiceStatus.DRAFT,
        customerId: 'c1',
        customerName: 'Acme',
        billingAddress: 'B',
        shippingAddress: 'S',
        paymentTermId: 'pt-default',
        salespersonId: 'sp-default',
        invoiceDate: new Date(),
        dueDate: null,
        notes: 'proforma notes',
        subtotal: { toFixed: () => '10.0000' },
        total: { toFixed: () => '10.0000' },
        sentAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [invoiceItem],
      };
      const prisma = {
        proformaInvoice: { findFirst: jest.fn().mockResolvedValue(proforma) },
        salesInvoice: {
          count: jest.fn().mockResolvedValue(2),
          create: jest.fn().mockResolvedValue(created),
        },
      };
      const customers = { require: jest.fn().mockResolvedValue(customer) };
      const audit = { record: jest.fn().mockResolvedValue(undefined) };
      const service = new SalesInvoicesService(
        prisma as never,
        customers as never,
        audit as never,
        makeEventBus() as never,
      );

      const result = await service.createFromProformaInvoice(actor, 'pf1', {});
      expect(result.sourceType).toBe(SalesInvoiceSourceType.PROFORMA_INVOICE);
      expect(result.sourceId).toBe('pf1');
    });

    it('rejects when the proforma invoice is not ISSUED', async () => {
      const prisma = {
        proformaInvoice: {
          findFirst: jest.fn().mockResolvedValue({
            ...proforma,
            status: ProformaInvoiceStatus.DRAFT,
          }),
        },
      };
      const service = new SalesInvoicesService(
        prisma as never,
        { require: jest.fn() } as never,
        { record: jest.fn() } as never,
        makeEventBus() as never,
      );
      await expect(
        service.createFromProformaInvoice(actor, 'pf1', {}),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    const draftRow = {
      id: 'inv1',
      tenantId,
      status: SalesInvoiceStatus.DRAFT,
      items: [{ id: 'i1' }],
    };

    it('rejects when not DRAFT', async () => {
      const prisma = {
        salesInvoice: {
          findFirst: jest.fn().mockResolvedValue({
            ...draftRow,
            status: SalesInvoiceStatus.SENT,
          }),
        },
      };
      const service = new SalesInvoicesService(
        prisma as never,
        { require: jest.fn() } as never,
        { record: jest.fn() } as never,
        makeEventBus() as never,
      );
      await expect(
        service.update(actor, 'inv1', { notes: 'x' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects when no fields to update', async () => {
      const prisma = {
        salesInvoice: { findFirst: jest.fn().mockResolvedValue(draftRow) },
      };
      const service = new SalesInvoicesService(
        prisma as never,
        { require: jest.fn() } as never,
        { record: jest.fn() } as never,
        makeEventBus() as never,
      );
      await expect(service.update(actor, 'inv1', {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('send', () => {
    const draftRow = {
      id: 'inv1',
      tenantId,
      customerId: 'c1',
      status: SalesInvoiceStatus.DRAFT,
      items: [{ id: 'i1' }],
    };

    it('transitions DRAFT to SENT and publishes sales.invoice.posted exactly once', async () => {
      const sentRow = {
        ...draftRow,
        status: SalesInvoiceStatus.SENT,
        sentAt: new Date(),
        subtotal: { toFixed: () => '10.0000' },
        total: { toFixed: () => '10.0000' },
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const updateMock = jest.fn().mockResolvedValue(sentRow);
      const prisma = {
        salesInvoice: {
          findFirst: jest.fn().mockResolvedValue(draftRow),
          update: updateMock,
        },
      };
      const audit = { record: jest.fn().mockResolvedValue(undefined) };
      const eventBus = makeEventBus();
      const service = new SalesInvoicesService(
        prisma as never,
        { require: jest.fn() } as never,
        audit as never,
        eventBus as never,
      );
      const result = await service.send(actor, 'inv1');
      expect(result.status).toBe(SalesInvoiceStatus.SENT);
      expect(updateMock.mock.calls[0][0].data.status).toBe(SalesInvoiceStatus.SENT);
      // Give the fire-and-forget firstValueFrom(...) microtask a chance to run.
      await Promise.resolve();
      expect(eventBus.emit).toHaveBeenCalledTimes(1);
      const [eventName, envelope] = eventBus.emit.mock.calls[0];
      expect(eventName).toBe('sales.invoice.posted');
      expect(envelope.payload).toEqual(
        expect.objectContaining({
          invoiceId: 'inv1',
          tenantId,
          customerId: 'c1',
          currency: 'USD',
          totalAmount: '10.0000',
        }),
      );
    });

    it('rejects sending a non-DRAFT invoice (idempotency guard against double-posting)', async () => {
      const prisma = {
        salesInvoice: {
          findFirst: jest.fn().mockResolvedValue({
            ...draftRow,
            status: SalesInvoiceStatus.SENT,
          }),
        },
      };
      const eventBus = makeEventBus();
      const service = new SalesInvoicesService(
        prisma as never,
        { require: jest.fn() } as never,
        { record: jest.fn() } as never,
        eventBus as never,
      );
      await expect(service.send(actor, 'inv1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(eventBus.emit).not.toHaveBeenCalled();
    });

    it('rejects sending an invoice with no items', async () => {
      const prisma = {
        salesInvoice: {
          findFirst: jest.fn().mockResolvedValue({ ...draftRow, items: [] }),
        },
      };
      const service = new SalesInvoicesService(
        prisma as never,
        { require: jest.fn() } as never,
        { record: jest.fn() } as never,
        makeEventBus() as never,
      );
      await expect(service.send(actor, 'inv1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('cancel', () => {
    it.each([SalesInvoiceStatus.DRAFT, SalesInvoiceStatus.SENT])(
      'cancels from %s',
      async (status) => {
        const row = { id: 'inv1', tenantId, status, items: [] };
        const cancelled = {
          ...row,
          status: SalesInvoiceStatus.CANCELLED,
          subtotal: { toFixed: () => '0.0000' },
          total: { toFixed: () => '0.0000' },
          sentAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        const prisma = {
          salesInvoice: {
            findFirst: jest.fn().mockResolvedValue(row),
            update: jest.fn().mockResolvedValue(cancelled),
          },
        };
        const audit = { record: jest.fn().mockResolvedValue(undefined) };
        const service = new SalesInvoicesService(
          prisma as never,
          { require: jest.fn() } as never,
          audit as never,
          makeEventBus() as never,
        );
        const result = await service.cancel(actor, 'inv1');
        expect(result.status).toBe(SalesInvoiceStatus.CANCELLED);
      },
    );

    it('rejects cancelling an already-CANCELLED invoice', async () => {
      const prisma = {
        salesInvoice: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'inv1',
            tenantId,
            status: SalesInvoiceStatus.CANCELLED,
            items: [],
          }),
        },
      };
      const service = new SalesInvoicesService(
        prisma as never,
        { require: jest.fn() } as never,
        { record: jest.fn() } as never,
        makeEventBus() as never,
      );
      await expect(service.cancel(actor, 'inv1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });
});
