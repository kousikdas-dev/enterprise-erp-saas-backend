import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { of } from 'rxjs';
import {
  Prisma,
  ProformaInvoiceStatus,
  SalesInvoicePaymentStatus,
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
  const unitOfMeasureId = 'unit-ea';
  const taxCodeId = 'tax-1';

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

  function zeroTotals() {
    return {
      discountTotal: { toFixed: () => '0.0000' },
      taxTotal: { toFixed: () => '0.0000' },
    };
  }

  /** Default payment state for a freshly created/updated invoice — real Decimal since the response mapper computes balanceDue = total.minus(amountPaid). */
  function unpaidState() {
    return {
      amountPaid: new Prisma.Decimal(0),
      paymentStatus: SalesInvoicePaymentStatus.UNPAID,
    };
  }

  const invoiceItem = {
    id: 'sii1',
    tenantId,
    salesInvoiceId: 'inv1',
    productId: 'p1',
    productSku: 'SKU',
    productName: 'Widget',
    quantity: { toFixed: () => '1.000000' },
    unitOfMeasureId,
    uomCode: 'EA',
    uomName: 'Each',
    conversionFactor: { toFixed: () => '1.000000' },
    unitPrice: { toFixed: () => '10.0000' },
    discountPercent: { toFixed: () => '0.00' },
    discountAmount: { toFixed: () => '0.0000' },
    taxCodeId: null,
    taxCode: null,
    taxCodeName: null,
    taxAmount: { toFixed: () => '0.0000' },
    lineSubtotal: { toFixed: () => '10.0000' },
    lineTotal: { toFixed: () => '10.0000' },
    createdAt: new Date(),
    updatedAt: new Date(),
    taxComponents: [],
  };

  /** A SalesOrderItem/ProformaInvoiceItem-shaped source row with UOM/discount/tax fields and taxComponents. */
  function sourceItem(overrides: Record<string, unknown> = {}) {
    return {
      productId: 'p1',
      productSku: 'SKU',
      productName: 'Widget',
      quantity: { toFixed: () => '1.000000', toString: () => '1' },
      unitOfMeasureId,
      uomCode: 'EA',
      uomName: 'Each',
      conversionFactor: { toFixed: () => '1.000000' },
      unitPrice: { toFixed: () => '10.0000', toString: () => '10' },
      discountPercent: { toFixed: () => '10.00' },
      discountAmount: { toFixed: () => '1.0000' },
      taxCodeId,
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
        ...zeroTotals(),
        total: new Prisma.Decimal(10),
        ...unpaidState(),
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

      // manual invoices have no UOM/discount/tax input capability yet: every
      // new snapshot field must be its neutral (null/zero/empty) value.
      const data = createMock.mock.calls[0][0].data;
      expect(data.discountTotal.toFixed(4)).toBe('0.0000');
      expect(data.taxTotal.toFixed(4)).toBe('0.0000');
      const createdItem = data.items.create[0];
      expect(createdItem.unitOfMeasureId).toBeNull();
      expect(createdItem.discountAmount.toFixed(4)).toBe('0.0000');
      expect(createdItem.taxCodeId).toBeNull();
      expect(createdItem.taxAmount.toFixed(4)).toBe('0.0000');
      expect(createdItem.lineSubtotal.toFixed(4)).toBe('10.0000');
      expect(createdItem.taxComponents.create).toEqual([]);
    });
  });

  describe('createFromSalesOrder', () => {
    function orderFixture(overrides: Record<string, unknown> = {}) {
      return {
        id: 'so1',
        tenantId,
        status: SalesOrderStatus.CONFIRMED,
        customerId: 'c1',
        customerName: 'Acme',
        billingAddress: 'B',
        shippingAddress: 'S',
        notes: 'order notes',
        subtotal: { toString: () => '10' },
        discountTotal: { toString: () => '1' },
        taxTotal: { toString: () => '1.62' },
        total: { toString: () => '10.62' },
        items: [sourceItem()],
        ...overrides,
      };
    }

    it('creates a DRAFT invoice sourced from a non-CANCELLED sales order and copies UOM/discount/tax fields verbatim', async () => {
      const order = orderFixture();
      const item = order.items[0];
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
        ...zeroTotals(),
        total: new Prisma.Decimal(10),
        ...unpaidState(),
        sentAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [invoiceItem],
      };
      const createMock = jest.fn().mockResolvedValue(created);
      const prisma = {
        salesOrder: { findFirst: jest.fn().mockResolvedValue(order) },
        salesInvoice: {
          count: jest.fn().mockResolvedValue(1),
          create: createMock,
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

      const data = createMock.mock.calls[0][0].data;
      expect(data.discountTotal).toBe(order.discountTotal);
      expect(data.taxTotal).toBe(order.taxTotal);
      const createdItem = data.items.create[0];
      expect(createdItem.unitOfMeasureId).toBe(item.unitOfMeasureId);
      expect(createdItem.discountAmount).toBe(item.discountAmount);
      expect(createdItem.taxCodeId).toBe(item.taxCodeId);
      expect(createdItem.lineSubtotal).toBe(item.lineSubtotal);
      expect(createdItem.taxComponents.create).toHaveLength(2);
      expect(createdItem.taxComponents.create[0].rate).toBe(
        item.taxComponents[0].rate,
      );
    });

    it('rejects when the sales order is CANCELLED', async () => {
      const prisma = {
        salesOrder: {
          findFirst: jest.fn().mockResolvedValue(
            orderFixture({ status: SalesOrderStatus.CANCELLED }),
          ),
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
    function proformaFixture(overrides: Record<string, unknown> = {}) {
      return {
        id: 'pf1',
        tenantId,
        status: ProformaInvoiceStatus.ISSUED,
        customerId: 'c1',
        customerName: 'Acme',
        billingAddress: 'B',
        shippingAddress: 'S',
        notes: 'proforma notes',
        subtotal: { toString: () => '10' },
        discountTotal: { toString: () => '1' },
        taxTotal: { toString: () => '1.62' },
        total: { toString: () => '10.62' },
        items: [sourceItem()],
        ...overrides,
      };
    }

    it('creates a DRAFT invoice sourced from an ISSUED proforma invoice and copies UOM/discount/tax fields verbatim', async () => {
      const proforma = proformaFixture();
      const item = proforma.items[0];
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
        ...zeroTotals(),
        total: new Prisma.Decimal(10),
        ...unpaidState(),
        sentAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [invoiceItem],
      };
      const createMock = jest.fn().mockResolvedValue(created);
      const prisma = {
        proformaInvoice: { findFirst: jest.fn().mockResolvedValue(proforma) },
        salesInvoice: {
          count: jest.fn().mockResolvedValue(2),
          create: createMock,
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

      const data = createMock.mock.calls[0][0].data;
      expect(data.discountTotal).toBe(proforma.discountTotal);
      expect(data.taxTotal).toBe(proforma.taxTotal);
      const createdItem = data.items.create[0];
      expect(createdItem.unitOfMeasureId).toBe(item.unitOfMeasureId);
      expect(createdItem.taxCodeId).toBe(item.taxCodeId);
      expect(createdItem.taxComponents.create).toHaveLength(2);
    });

    it('rejects when the proforma invoice is not ISSUED', async () => {
      const prisma = {
        proformaInvoice: {
          findFirst: jest.fn().mockResolvedValue(
            proformaFixture({ status: ProformaInvoiceStatus.DRAFT }),
          ),
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

    it('resets discountTotal/taxTotal to 0 when items are manually replaced', async () => {
      const updated = {
        ...draftRow,
        subtotal: { toFixed: () => '10.0000' },
        ...zeroTotals(),
        total: new Prisma.Decimal(10),
        ...unpaidState(),
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const updateMock = jest.fn().mockResolvedValue(updated);
      const tx = {
        salesInvoice: { update: updateMock },
        salesInvoiceItem: {
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      const prisma = {
        salesInvoice: { findFirst: jest.fn().mockResolvedValue(draftRow) },
        $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)),
      };
      const service = new SalesInvoicesService(
        prisma as never,
        { require: jest.fn() } as never,
        { record: jest.fn().mockResolvedValue(undefined) } as never,
        makeEventBus() as never,
      );

      await service.update(actor, 'inv1', {
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
    const draftRow = {
      id: 'inv1',
      tenantId,
      customerId: 'c1',
      status: SalesInvoiceStatus.DRAFT,
      total: new Prisma.Decimal(10),
      items: [{ id: 'i1' }],
    };

    it('transitions DRAFT to SENT and publishes sales.invoice.posted exactly once', async () => {
      const sentRow = {
        ...draftRow,
        status: SalesInvoiceStatus.SENT,
        sentAt: new Date(),
        subtotal: { toFixed: () => '10.0000' },
        ...zeroTotals(),
        total: new Prisma.Decimal(10),
        ...unpaidState(),
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

    it('marks a zero-total invoice as PAID when sent (no balance can ever be due)', async () => {
      const zeroTotalDraft = { ...draftRow, total: new Prisma.Decimal(0) };
      const updateMock = jest.fn().mockResolvedValue({
        ...zeroTotalDraft,
        status: SalesInvoiceStatus.SENT,
        sentAt: new Date(),
        subtotal: { toFixed: () => '0.0000' },
        ...zeroTotals(),
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        amountPaid: new Prisma.Decimal(0),
        paymentStatus: SalesInvoicePaymentStatus.PAID,
      });
      const prisma = {
        salesInvoice: {
          findFirst: jest.fn().mockResolvedValue(zeroTotalDraft),
          update: updateMock,
        },
      };
      const service = new SalesInvoicesService(
        prisma as never,
        { require: jest.fn() } as never,
        { record: jest.fn().mockResolvedValue(undefined) } as never,
        makeEventBus() as never,
      );
      await service.send(actor, 'inv1');
      expect(updateMock.mock.calls[0][0].data.paymentStatus).toBe(
        SalesInvoicePaymentStatus.PAID,
      );
    });
  });

  describe('cancel', () => {
    it.each([SalesInvoiceStatus.DRAFT, SalesInvoiceStatus.SENT])(
      'cancels from %s',
      async (status) => {
        const row = {
          id: 'inv1',
          tenantId,
          status,
          items: [],
          ...unpaidState(),
        };
        const cancelled = {
          ...row,
          status: SalesInvoiceStatus.CANCELLED,
          subtotal: { toFixed: () => '0.0000' },
          ...zeroTotals(),
          total: new Prisma.Decimal(0),
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

    it('rejects cancelling a SENT invoice that has recorded payments', async () => {
      const prisma = {
        salesInvoice: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'inv1',
            tenantId,
            status: SalesInvoiceStatus.SENT,
            items: [],
            amountPaid: new Prisma.Decimal(40),
            paymentStatus: SalesInvoicePaymentStatus.PARTIALLY_PAID,
          }),
        },
      };
      const service = new SalesInvoicesService(
        prisma as never,
        { require: jest.fn() } as never,
        { record: jest.fn() } as never,
        makeEventBus() as never,
      );
      await expect(service.cancel(actor, 'inv1')).rejects.toThrow(
        'Cannot cancel a sales invoice that has recorded payments',
      );
    });

    it('rejects cancelling a fully PAID invoice with the same payment-specific error', async () => {
      const prisma = {
        salesInvoice: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'inv1',
            tenantId,
            status: SalesInvoiceStatus.SENT,
            items: [],
            amountPaid: new Prisma.Decimal(100),
            paymentStatus: SalesInvoicePaymentStatus.PAID,
          }),
        },
      };
      const service = new SalesInvoicesService(
        prisma as never,
        { require: jest.fn() } as never,
        { record: jest.fn() } as never,
        makeEventBus() as never,
      );
      await expect(service.cancel(actor, 'inv1')).rejects.toThrow(
        'Cannot cancel a sales invoice that has recorded payments',
      );
    });
  });

  describe('recordPayment', () => {
    function sentInvoiceRow(overrides: Record<string, unknown> = {}) {
      return {
        id: 'inv1',
        tenantId,
        status: SalesInvoiceStatus.SENT,
        total: new Prisma.Decimal(100),
        amountPaid: new Prisma.Decimal(0),
        paymentStatus: SalesInvoicePaymentStatus.UNPAID,
        ...overrides,
      };
    }

    function makePaymentRow(overrides: Record<string, unknown> = {}) {
      return {
        id: 'pay1',
        tenantId,
        salesInvoiceId: 'inv1',
        amount: new Prisma.Decimal(40),
        paymentDate: new Date('2026-01-15'),
        paymentMethodId: null,
        reference: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
      };
    }

    /** Builds a $transaction mock whose tx exposes the raw-SQL lock plus the typed queries recordPayment relies on. */
    function makeTxHarness(options: {
      lockRows?: Array<{ id: string }>;
      invoice: ReturnType<typeof sentInvoiceRow>;
      createdPayment: ReturnType<typeof makePaymentRow>;
      updatedInvoice?: Record<string, unknown>;
    }) {
      const queryRawMock = jest
        .fn()
        .mockResolvedValue(options.lockRows ?? [{ id: 'inv1' }]);
      const findFirstOrThrowMock = jest.fn().mockResolvedValue(options.invoice);
      const createPaymentMock = jest
        .fn()
        .mockResolvedValue(options.createdPayment);
      const updateInvoiceMock = jest.fn().mockResolvedValue(
        options.updatedInvoice ?? {
          ...options.invoice,
          items: [],
          subtotal: options.invoice.total,
          discountTotal: new Prisma.Decimal(0),
          taxTotal: new Prisma.Decimal(0),
          sentAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      );
      const tx = {
        $queryRaw: queryRawMock,
        salesInvoice: {
          findFirstOrThrow: findFirstOrThrowMock,
          update: updateInvoiceMock,
        },
        salesPayment: { create: createPaymentMock },
      };
      const prisma = {
        $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)),
      };
      return { prisma, tx, queryRawMock, findFirstOrThrowMock, createPaymentMock, updateInvoiceMock };
    }

    function makeService(prisma: unknown, audit: { record: jest.Mock } = { record: jest.fn().mockResolvedValue(undefined) }) {
      return new SalesInvoicesService(
        prisma as never,
        { require: jest.fn() } as never,
        audit as never,
        makeEventBus() as never,
      );
    }

    it('accepts a payment against a SENT invoice and returns payment + updated balance', async () => {
      const invoice = sentInvoiceRow();
      const payment = makePaymentRow({ amount: new Prisma.Decimal(40) });
      const { prisma, updateInvoiceMock } = makeTxHarness({
        invoice,
        createdPayment: payment,
      });
      const service = makeService(prisma);

      const result = await service.recordPayment(actor, 'inv1', {
        amount: '40',
        paymentDate: '2026-01-15',
      });

      expect(result.payment.amount).toBe('40.0000');
      expect(updateInvoiceMock.mock.calls[0][0].data.amountPaid.toFixed(4)).toBe(
        '40.0000',
      );
      expect(updateInvoiceMock.mock.calls[0][0].data.paymentStatus).toBe(
        SalesInvoicePaymentStatus.PARTIALLY_PAID,
      );
    });

    it('rejects payment against a DRAFT invoice', async () => {
      const invoice = sentInvoiceRow({ status: SalesInvoiceStatus.DRAFT });
      const { prisma } = makeTxHarness({ invoice, createdPayment: makePaymentRow() });
      const service = makeService(prisma);

      await expect(
        service.recordPayment(actor, 'inv1', { amount: '10', paymentDate: '2026-01-15' }),
      ).rejects.toThrow('Only SENT sales invoices can receive payments');
    });

    it('rejects payment against a CANCELLED invoice', async () => {
      const invoice = sentInvoiceRow({ status: SalesInvoiceStatus.CANCELLED });
      const { prisma } = makeTxHarness({ invoice, createdPayment: makePaymentRow() });
      const service = makeService(prisma);

      await expect(
        service.recordPayment(actor, 'inv1', { amount: '10', paymentDate: '2026-01-15' }),
      ).rejects.toThrow('Only SENT sales invoices can receive payments');
    });

    it('rejects a zero-amount payment', async () => {
      const invoice = sentInvoiceRow();
      const { prisma } = makeTxHarness({ invoice, createdPayment: makePaymentRow() });
      const service = makeService(prisma);

      await expect(
        service.recordPayment(actor, 'inv1', { amount: '0', paymentDate: '2026-01-15' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a negative-amount payment', async () => {
      const invoice = sentInvoiceRow();
      const { prisma } = makeTxHarness({ invoice, createdPayment: makePaymentRow() });
      const service = makeService(prisma);

      await expect(
        service.recordPayment(actor, 'inv1', { amount: '-5', paymentDate: '2026-01-15' }),
      ).rejects.toThrow();
    });

    it('rejects an overpayment exceeding the remaining balance', async () => {
      const invoice = sentInvoiceRow({ amountPaid: new Prisma.Decimal(60) });
      const { prisma } = makeTxHarness({ invoice, createdPayment: makePaymentRow() });
      const service = makeService(prisma);

      await expect(
        service.recordPayment(actor, 'inv1', { amount: '41', paymentDate: '2026-01-15' }),
      ).rejects.toThrow('Payment amount exceeds the remaining balance due');
    });

    it('accepts a payment exactly equal to the remaining balance and marks the invoice PAID', async () => {
      const invoice = sentInvoiceRow({ amountPaid: new Prisma.Decimal(60) });
      const payment = makePaymentRow({ amount: new Prisma.Decimal(40) });
      const { prisma, updateInvoiceMock } = makeTxHarness({ invoice, createdPayment: payment });
      const service = makeService(prisma);

      await service.recordPayment(actor, 'inv1', { amount: '40', paymentDate: '2026-01-15' });

      expect(updateInvoiceMock.mock.calls[0][0].data.amountPaid.toFixed(4)).toBe(
        '100.0000',
      );
      expect(updateInvoiceMock.mock.calls[0][0].data.paymentStatus).toBe(
        SalesInvoicePaymentStatus.PAID,
      );
    });

    it('accumulates multiple partial payments correctly and stays PARTIALLY_PAID', async () => {
      // Simulates the invoice state as it stands after a prior partial payment of 30.
      const invoice = sentInvoiceRow({
        amountPaid: new Prisma.Decimal(30),
        paymentStatus: SalesInvoicePaymentStatus.PARTIALLY_PAID,
      });
      const payment = makePaymentRow({ amount: new Prisma.Decimal(20) });
      const { prisma, updateInvoiceMock } = makeTxHarness({ invoice, createdPayment: payment });
      const service = makeService(prisma);

      await service.recordPayment(actor, 'inv1', { amount: '20', paymentDate: '2026-01-15' });

      expect(updateInvoiceMock.mock.calls[0][0].data.amountPaid.toFixed(4)).toBe(
        '50.0000',
      );
      expect(updateInvoiceMock.mock.calls[0][0].data.paymentStatus).toBe(
        SalesInvoicePaymentStatus.PARTIALLY_PAID,
      );
    });

    it('a second payment completing the balance transitions the invoice to PAID', async () => {
      const invoice = sentInvoiceRow({
        amountPaid: new Prisma.Decimal(70),
        paymentStatus: SalesInvoicePaymentStatus.PARTIALLY_PAID,
      });
      const payment = makePaymentRow({ amount: new Prisma.Decimal(30) });
      const { prisma, updateInvoiceMock } = makeTxHarness({ invoice, createdPayment: payment });
      const service = makeService(prisma);

      await service.recordPayment(actor, 'inv1', { amount: '30', paymentDate: '2026-01-15' });

      expect(updateInvoiceMock.mock.calls[0][0].data.paymentStatus).toBe(
        SalesInvoicePaymentStatus.PAID,
      );
    });

    it('allows an optional paymentMethodId to be omitted (nullable)', async () => {
      const invoice = sentInvoiceRow();
      const payment = makePaymentRow({ paymentMethodId: null });
      const { prisma, createPaymentMock } = makeTxHarness({ invoice, createdPayment: payment });
      const service = makeService(prisma);

      await service.recordPayment(actor, 'inv1', { amount: '40', paymentDate: '2026-01-15' });

      expect(createPaymentMock.mock.calls[0][0].data.paymentMethodId).toBeNull();
    });

    it('records the supplied paymentMethodId when provided', async () => {
      const invoice = sentInvoiceRow();
      const payment = makePaymentRow({ paymentMethodId: 'pm-1' });
      const { prisma, createPaymentMock } = makeTxHarness({ invoice, createdPayment: payment });
      const service = makeService(prisma);

      await service.recordPayment(actor, 'inv1', {
        amount: '40',
        paymentDate: '2026-01-15',
        paymentMethodId: 'pm-1',
      });

      expect(createPaymentMock.mock.calls[0][0].data.paymentMethodId).toBe('pm-1');
    });

    it('rejects with NotFoundException when the invoice does not belong to the caller tenant (lock query finds no row)', async () => {
      const invoice = sentInvoiceRow();
      const { prisma } = makeTxHarness({
        invoice,
        createdPayment: makePaymentRow(),
        lockRows: [],
      });
      const service = makeService(prisma);

      await expect(
        service.recordPayment(actor, 'inv1', { amount: '10', paymentDate: '2026-01-15' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects another payment against an already fully PAID invoice', async () => {
      const invoice = sentInvoiceRow({
        amountPaid: new Prisma.Decimal(100),
        paymentStatus: SalesInvoicePaymentStatus.PAID,
      });
      const { prisma } = makeTxHarness({ invoice, createdPayment: makePaymentRow() });
      const service = makeService(prisma);

      await expect(
        service.recordPayment(actor, 'inv1', { amount: '10', paymentDate: '2026-01-15' }),
      ).rejects.toThrow('Sales invoice is already fully paid');
    });

    it('rejects payment against a zero-total SENT invoice (marked PAID at send time, so no balance is ever due)', async () => {
      const invoice = sentInvoiceRow({
        total: new Prisma.Decimal(0),
        amountPaid: new Prisma.Decimal(0),
        paymentStatus: SalesInvoicePaymentStatus.PAID,
      });
      const { prisma } = makeTxHarness({ invoice, createdPayment: makePaymentRow() });
      const service = makeService(prisma);

      await expect(
        service.recordPayment(actor, 'inv1', { amount: '10', paymentDate: '2026-01-15' }),
      ).rejects.toThrow('Sales invoice is already fully paid');
    });

    it('locks the SalesInvoice row FOR UPDATE as the concurrency serialization point before validating', async () => {
      const invoice = sentInvoiceRow();
      const { prisma, queryRawMock, findFirstOrThrowMock } = makeTxHarness({
        invoice,
        createdPayment: makePaymentRow(),
      });
      const service = makeService(prisma);

      await service.recordPayment(actor, 'inv1', { amount: '10', paymentDate: '2026-01-15' });

      expect(queryRawMock).toHaveBeenCalledTimes(1);
      const lockQuery = queryRawMock.mock.calls[0][0] as { sql: string };
      expect(lockQuery.sql).toContain('FOR UPDATE');
      // The lock must be acquired before the authoritative row is re-read for validation.
      expect(queryRawMock.mock.invocationCallOrder[0]).toBeLessThan(
        findFirstOrThrowMock.mock.invocationCallOrder[0],
      );
    });

    it('computes amountPaid/balanceDue/paymentStatus correctly on the returned invoice', async () => {
      const invoice = sentInvoiceRow({ amountPaid: new Prisma.Decimal(30) });
      const payment = makePaymentRow({ amount: new Prisma.Decimal(20) });
      const updatedInvoice = {
        ...invoice,
        amountPaid: new Prisma.Decimal(50),
        paymentStatus: SalesInvoicePaymentStatus.PARTIALLY_PAID,
        items: [],
        subtotal: invoice.total,
        discountTotal: new Prisma.Decimal(0),
        taxTotal: new Prisma.Decimal(0),
        sentAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const { prisma } = makeTxHarness({
        invoice,
        createdPayment: payment,
        updatedInvoice,
      });
      const service = makeService(prisma);

      const result = await service.recordPayment(actor, 'inv1', {
        amount: '20',
        paymentDate: '2026-01-15',
      });

      expect(result.invoice.amountPaid).toBe('50.0000');
      expect(result.invoice.balanceDue).toBe('50.0000');
      expect(result.invoice.paymentStatus).toBe(
        SalesInvoicePaymentStatus.PARTIALLY_PAID,
      );
    });
  });

  describe('listPayments', () => {
    it('lists payment history for a JWT-tenant invoice, scoped to tenant', async () => {
      const findFirstMock = jest.fn().mockResolvedValue({
        id: 'inv1',
        tenantId,
        status: SalesInvoiceStatus.SENT,
        items: [],
      });
      const findManyMock = jest.fn().mockResolvedValue([
        {
          id: 'pay1',
          tenantId,
          salesInvoiceId: 'inv1',
          amount: new Prisma.Decimal(40),
          paymentDate: new Date('2026-01-15'),
          paymentMethodId: null,
          reference: null,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      const prisma = {
        salesInvoice: { findFirst: findFirstMock },
        salesPayment: { findMany: findManyMock },
      };
      const service = new SalesInvoicesService(
        prisma as never,
        { require: jest.fn() } as never,
        { record: jest.fn() } as never,
        makeEventBus() as never,
      );

      const result = await service.listPayments(actor, 'inv1');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].amount).toBe('40.0000');
      expect(findManyMock.mock.calls[0][0].where).toEqual({
        salesInvoiceId: 'inv1',
        tenantId,
      });
    });

    it('returns 404 when the invoice does not exist in the caller tenant', async () => {
      const prisma = {
        salesInvoice: { findFirst: jest.fn().mockResolvedValue(null) },
      };
      const service = new SalesInvoicesService(
        prisma as never,
        { require: jest.fn() } as never,
        { record: jest.fn() } as never,
        makeEventBus() as never,
      );

      await expect(service.listPayments(actor, 'inv1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
