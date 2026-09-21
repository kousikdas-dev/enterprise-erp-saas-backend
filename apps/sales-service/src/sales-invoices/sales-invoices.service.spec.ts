import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { of } from 'rxjs';
import {
  Prisma,
  ProformaInvoiceStatus,
  SalesInvoicePaymentStatus,
  SalesInvoicePostingStatus,
  SalesInvoiceSourceType,
  SalesInvoiceStatus,
  SalesOrderStatus,
  SalesPaymentPostingStatus,
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

  /** Default InventoryProductClient mock: product 'p1' has base UOM `unitOfMeasureId` (EA) and one alternative (BOX, factor 12). */
  function makeInventoryProducts(overrides: Partial<{ getUomOptions: jest.Mock }> = {}) {
    return {
      getUomOptions: jest.fn().mockResolvedValue({
        productId: 'p1',
        base: { unitOfMeasureId, code: 'EA', name: 'Each' },
        alternatives: [
          {
            unitOfMeasureId: 'unit-box',
            code: 'BOX',
            name: 'Box',
            conversionFactor: '12',
            sellingPrice: '110.0000',
          },
        ],
      }),
      ...overrides,
    };
  }

  /** Default AccountingTaxCodeClient mock: `taxCodeId` resolves to a 2-component 18% GST code (9% CGST + 9% SGST), matching sourceItem()'s snapshot shape. */
  function makeAccountingTaxCodes(overrides: Partial<{ getById: jest.Mock }> = {}) {
    return {
      getById: jest.fn().mockResolvedValue({
        id: taxCodeId,
        code: 'GST18',
        name: 'GST 18%',
        description: null,
        isActive: true,
        components: [
          { id: 'c1', sequence: 1, type: 'CGST', name: null, rate: '9.00' },
          { id: 'c2', sequence: 2, type: 'SGST', name: null, rate: '9.00' },
        ],
      }),
      ...overrides,
    };
  }

  /**
   * Default AccountingJournalClient mock: post()/reverse() both resolve
   * successfully. Mirrors PurchaseInvoicesService's own
   * buildAccountingJournalMock() default — most tests never care about the
   * accounting posting outcome, only the ones exercising the Sales
   * Accounting Integration itself override post/reverse explicitly.
   */
  function makeAccountingJournal(
    overrides: Partial<{ post: jest.Mock; reverse: jest.Mock }> = {},
  ) {
    return {
      post:
        overrides.post ??
        jest.fn().mockResolvedValue({
          id: 'je-mock',
          entryNumber: 'JE-00000001',
          status: 'POSTED',
          sourceService: 'sales-service',
          sourceType: 'SALES_INVOICE',
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
          sourceService: 'sales-service',
          sourceType: 'SALES_INVOICE_CANCELLATION',
          sourceId: 'mock',
          reversesJournalEntryId: 'je-mock',
          idempotentReplay: false,
          totalDebit: '0.0000',
          totalCredit: '0.0000',
        }),
    };
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
        makeInventoryProducts() as never,
        makeAccountingTaxCodes() as never,
        makeAccountingJournal() as never,
      );

      const result = await service.create(actor, {
        customerId: 'c1',
        items: [
          {
            productId: 'p1',
            productSku: 'SKU',
            productName: 'Widget',
            quantity: '1',
            unitOfMeasureId,
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

      // No discount/tax code supplied: those fields stay at their neutral
      // value, but UOM is now resolved and validated server-side via
      // InventoryProductClient — it is no longer forced to null.
      const data = createMock.mock.calls[0][0].data;
      expect(data.discountTotal.toFixed(4)).toBe('0.0000');
      expect(data.taxTotal.toFixed(4)).toBe('0.0000');
      const createdItem = data.items.create[0];
      expect(createdItem.unitOfMeasureId).toBe(unitOfMeasureId);
      expect(createdItem.uomCode).toBe('EA');
      expect(createdItem.discountAmount.toFixed(4)).toBe('0.0000');
      expect(createdItem.taxCodeId).toBeNull();
      expect(createdItem.taxAmount.toFixed(4)).toBe('0.0000');
      expect(createdItem.lineSubtotal.toFixed(4)).toBe('10.0000');
      expect(createdItem.taxComponents.create).toEqual([]);
    });

    it('computes lineSubtotal/taxAmount/lineTotal and document totals from discount % and an independent multi-component tax code, using HALF_UP rounding (mirrors QuotationsService)', async () => {
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
        subtotal: { toFixed: () => '100.0000' },
        discountTotal: { toFixed: () => '10.0000' },
        taxTotal: { toFixed: () => '16.2000' },
        total: new Prisma.Decimal(106.2),
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
        makeInventoryProducts() as never,
        makeAccountingTaxCodes() as never,
        makeAccountingJournal() as never,
      );

      await service.create(actor, {
        customerId: 'c1',
        items: [
          {
            productId: 'p1',
            productSku: 'SKU',
            productName: 'Widget',
            quantity: '10',
            unitOfMeasureId,
            unitPrice: '10',
            discountPercent: '10',
            taxCodeId,
          },
        ],
      });

      const data = createMock.mock.calls[0][0].data;
      // gross = 10 * 10 = 100; discount = 10% of 100 = 10; lineSubtotal = 90.
      expect(data.subtotal.toFixed(4)).toBe('100.0000');
      expect(data.discountTotal.toFixed(4)).toBe('10.0000');
      // Each 9% component rounds independently on the 90 subtotal: 8.1 + 8.1 = 16.2.
      expect(data.taxTotal.toFixed(4)).toBe('16.2000');
      expect(data.total.toFixed(4)).toBe('106.2000');

      const createdItem = data.items.create[0];
      expect(createdItem.discountAmount.toFixed(4)).toBe('10.0000');
      expect(createdItem.lineSubtotal.toFixed(4)).toBe('90.0000');
      expect(createdItem.taxAmount.toFixed(4)).toBe('16.2000');
      expect(createdItem.lineTotal.toFixed(4)).toBe('106.2000');
      expect(createdItem.taxCode).toBe('GST18');
      expect(createdItem.taxComponents.create).toHaveLength(2);
      expect(createdItem.taxComponents.create[0].componentTaxAmount.toFixed(4)).toBe(
        '8.1000',
      );
      expect(createdItem.taxComponents.create[1].componentTaxAmount.toFixed(4)).toBe(
        '8.1000',
      );
    });

    it('rejects a unitOfMeasureId that is not valid for the selected product', async () => {
      const prisma = { salesInvoice: { count: jest.fn().mockResolvedValue(0) } };
      const customers = { require: jest.fn().mockResolvedValue(customer) };
      const service = new SalesInvoicesService(
        prisma as never,
        customers as never,
        { record: jest.fn() } as never,
        makeEventBus() as never,
        makeInventoryProducts() as never,
        makeAccountingTaxCodes() as never,
        makeAccountingJournal() as never,
      );

      await expect(
        service.create(actor, {
          customerId: 'c1',
          items: [
            {
              productId: 'p1',
              productSku: 'SKU',
              productName: 'Widget',
              quantity: '1',
              unitOfMeasureId: 'unit-not-valid-for-product',
              unitPrice: '10',
            },
          ],
        }),
      ).rejects.toThrow('Selected unit of measure is not valid for this product');
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
        // Distinct from the `customer` fixture's pt-default/sp-default, to prove
        // the order (not the customer) is the source — see the header-inheritance
        // tests below.
        paymentTermId: 'so-pt',
        salespersonId: 'so-sp',
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
        paymentTermId: 'so-pt',
        salespersonId: 'so-sp',
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
        makeInventoryProducts() as never,
        makeAccountingTaxCodes() as never,
        makeAccountingJournal() as never,
      );

      const result = await service.createFromSalesOrder(actor, 'so1', {});
      expect(result.sourceType).toBe(SalesInvoiceSourceType.SALES_ORDER);
      expect(result.sourceId).toBe('so1');

      const data = createMock.mock.calls[0][0].data;
      expect(data.discountTotal).toBe(order.discountTotal);
      expect(data.taxTotal).toBe(order.taxTotal);
      expect(data.paymentTermId).toBe(order.paymentTermId);
      expect(data.salespersonId).toBe(order.salespersonId);
      // The Sales Order is authoritative — Customer master is never consulted.
      expect(customers.require).not.toHaveBeenCalled();
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

    /** Minimal SalesInvoice-shaped row for toSalesInvoiceResponse() — the returned
     * value itself isn't under test here, only the arguments passed to create(). */
    function invoiceRowFixture(overrides: Record<string, unknown> = {}) {
      return {
        id: 'inv-x',
        tenantId,
        invoiceNumber: 'INV-X',
        sourceType: SalesInvoiceSourceType.SALES_ORDER,
        sourceId: 'so1',
        status: SalesInvoiceStatus.DRAFT,
        customerId: 'c1',
        customerName: 'Acme',
        billingAddress: 'B',
        shippingAddress: 'S',
        paymentTermId: null,
        salespersonId: null,
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
        items: [],
        ...overrides,
      };
    }

    it('uses the sales order\'s own paymentTermId/salespersonId even when they differ from the customer\'s', async () => {
      const order = orderFixture({
        paymentTermId: 'B',
        salespersonId: 'B',
      });
      const created = invoiceRowFixture({ id: 'inv3' });
      const createMock = jest.fn().mockResolvedValue(created);
      const prisma = {
        salesOrder: { findFirst: jest.fn().mockResolvedValue(order) },
        salesInvoice: {
          count: jest.fn().mockResolvedValue(1),
          create: createMock,
        },
      };
      const customers = {
        require: jest.fn().mockResolvedValue({
          ...customer,
          paymentTermId: 'A',
          salespersonId: 'A',
        }),
      };
      const service = new SalesInvoicesService(
        prisma as never,
        customers as never,
        { record: jest.fn().mockResolvedValue(undefined) } as never,
        makeEventBus() as never,
        makeInventoryProducts() as never,
        makeAccountingTaxCodes() as never,
        makeAccountingJournal() as never,
      );

      await service.createFromSalesOrder(actor, 'so1', {});

      const data = createMock.mock.calls[0][0].data;
      expect(data.paymentTermId).toBe('B');
      expect(data.salespersonId).toBe('B');
      expect(customers.require).not.toHaveBeenCalled();
    });

    it('preserves null paymentTermId/salespersonId from the sales order — never falls back to Customer master', async () => {
      const order = orderFixture({
        paymentTermId: null,
        salespersonId: null,
      });
      const created = invoiceRowFixture({ id: 'inv4' });
      const createMock = jest.fn().mockResolvedValue(created);
      const prisma = {
        salesOrder: { findFirst: jest.fn().mockResolvedValue(order) },
        salesInvoice: {
          count: jest.fn().mockResolvedValue(1),
          create: createMock,
        },
      };
      const customers = {
        require: jest.fn().mockResolvedValue({
          ...customer,
          paymentTermId: 'A',
          salespersonId: 'A',
        }),
      };
      const service = new SalesInvoicesService(
        prisma as never,
        customers as never,
        { record: jest.fn().mockResolvedValue(undefined) } as never,
        makeEventBus() as never,
        makeInventoryProducts() as never,
        makeAccountingTaxCodes() as never,
        makeAccountingJournal() as never,
      );

      await service.createFromSalesOrder(actor, 'so1', {});

      const data = createMock.mock.calls[0][0].data;
      expect(data.paymentTermId).toBeNull();
      expect(data.salespersonId).toBeNull();
      expect(customers.require).not.toHaveBeenCalled();
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
        makeInventoryProducts() as never,
        makeAccountingTaxCodes() as never,
        makeAccountingJournal() as never,
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
        makeInventoryProducts() as never,
        makeAccountingTaxCodes() as never,
        makeAccountingJournal() as never,
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
        makeInventoryProducts() as never,
        makeAccountingTaxCodes() as never,
        makeAccountingJournal() as never,
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
        makeInventoryProducts() as never,
        makeAccountingTaxCodes() as never,
        makeAccountingJournal() as never,
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
        makeInventoryProducts() as never,
        makeAccountingTaxCodes() as never,
        makeAccountingJournal() as never,
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
        makeInventoryProducts() as never,
        makeAccountingTaxCodes() as never,
        makeAccountingJournal() as never,
      );
      await expect(service.update(actor, 'inv1', {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('computes discountTotal/taxTotal as 0 when items are replaced with no discount/tax code', async () => {
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
      const createItemMock = jest.fn().mockResolvedValue({ id: 'sii-new' });
      const tx = {
        salesInvoice: { update: updateMock },
        salesInvoiceItem: {
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
          create: createItemMock,
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
        makeInventoryProducts() as never,
        makeAccountingTaxCodes() as never,
        makeAccountingJournal() as never,
      );

      await service.update(actor, 'inv1', {
        items: [
          {
            productId: 'p1',
            productSku: 'SKU',
            productName: 'Widget',
            quantity: '1',
            unitOfMeasureId,
            unitPrice: '10.0000',
          },
        ],
      });

      const data = updateMock.mock.calls[0][0].data;
      expect(data.discountTotal.toFixed(4)).toBe('0.0000');
      expect(data.taxTotal.toFixed(4)).toBe('0.0000');
      expect(createItemMock.mock.calls[0][0].data.taxComponents.create).toEqual([]);
    });

    it('replaces items via per-item create (not createMany) so nested taxComponents rows are persisted', async () => {
      // Regression test for the createMany -> create() fix: createMany cannot
      // create nested relations, so a naive implementation would silently
      // drop the SalesInvoiceItemTaxComponent rows for a multi-component tax code.
      const updated = {
        ...draftRow,
        subtotal: { toFixed: () => '100.0000' },
        discountTotal: { toFixed: () => '0.0000' },
        taxTotal: { toFixed: () => '18.0000' },
        total: new Prisma.Decimal(118),
        ...unpaidState(),
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const updateMock = jest.fn().mockResolvedValue(updated);
      const createItemMock = jest.fn().mockResolvedValue({ id: 'sii-new' });
      const tx = {
        salesInvoice: { update: updateMock },
        salesInvoiceItem: {
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
          create: createItemMock,
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
        makeInventoryProducts() as never,
        makeAccountingTaxCodes() as never,
        makeAccountingJournal() as never,
      );

      await service.update(actor, 'inv1', {
        items: [
          {
            productId: 'p1',
            productSku: 'SKU',
            productName: 'Widget',
            quantity: '10',
            unitOfMeasureId,
            unitPrice: '10',
            taxCodeId,
          },
        ],
      });

      expect(createItemMock).toHaveBeenCalledTimes(1);
      const itemData = createItemMock.mock.calls[0][0].data;
      expect(itemData.salesInvoiceId).toBe('inv1');
      expect(itemData.taxComponents.create).toHaveLength(2);
      expect(itemData.taxComponents.create[0]).toEqual(
        expect.objectContaining({ type: 'CGST' }),
      );
      expect(itemData.taxComponents.create[1]).toEqual(
        expect.objectContaining({ type: 'SGST' }),
      );
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
        // Real Decimal (not the {toFixed} stand-in zeroTotals()/fake fields
        // use elsewhere) — buildInvoicePostingRequest() calls .minus() on
        // these once send() posts the accounting journal post-commit.
        subtotal: new Prisma.Decimal(10),
        discountTotal: new Prisma.Decimal(0),
        taxTotal: new Prisma.Decimal(0),
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
        makeInventoryProducts() as never,
        makeAccountingTaxCodes() as never,
        makeAccountingJournal() as never,
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
        makeInventoryProducts() as never,
        makeAccountingTaxCodes() as never,
        makeAccountingJournal() as never,
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
        makeInventoryProducts() as never,
        makeAccountingTaxCodes() as never,
        makeAccountingJournal() as never,
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
        // Real Decimal — see the previous test's comment.
        subtotal: new Prisma.Decimal(0),
        discountTotal: new Prisma.Decimal(0),
        taxTotal: new Prisma.Decimal(0),
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
        makeInventoryProducts() as never,
        makeAccountingTaxCodes() as never,
        makeAccountingJournal() as never,
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
          makeInventoryProducts() as never,
          makeAccountingTaxCodes() as never,
          makeAccountingJournal() as never,
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
        makeInventoryProducts() as never,
        makeAccountingTaxCodes() as never,
        makeAccountingJournal() as never,
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
        makeInventoryProducts() as never,
        makeAccountingTaxCodes() as never,
        makeAccountingJournal() as never,
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
        makeInventoryProducts() as never,
        makeAccountingTaxCodes() as never,
        makeAccountingJournal() as never,
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
      // attemptPaymentPosting() runs post-commit against the outer
      // this.prisma (never the transactional tx client above), so the
      // top-level salesPayment mock needs its own update/findFirstOrThrow —
      // defaults mirror a successful posting (accountingPostingStatus
      // POSTED, journalEntryId set) since makeAccountingJournal()'s post()
      // resolves successfully by default.
      const paymentUpdateMock = jest.fn().mockImplementation(
        (args: { data: Record<string, unknown> }) => ({
          ...options.createdPayment,
          ...args.data,
        }),
      );
      const paymentFindFirstOrThrowMock = jest
        .fn()
        .mockResolvedValue(options.createdPayment);
      const prisma = {
        $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)),
        salesPayment: {
          update: paymentUpdateMock,
          findFirstOrThrow: paymentFindFirstOrThrowMock,
        },
      };
      return {
        prisma,
        tx,
        queryRawMock,
        findFirstOrThrowMock,
        createPaymentMock,
        updateInvoiceMock,
        paymentUpdateMock,
        paymentFindFirstOrThrowMock,
      };
    }

    function makeService(prisma: unknown, audit: { record: jest.Mock } = { record: jest.fn().mockResolvedValue(undefined) }) {
      return new SalesInvoicesService(
        prisma as never,
        { require: jest.fn() } as never,
        audit as never,
        makeEventBus() as never,
        makeInventoryProducts() as never,
        makeAccountingTaxCodes() as never,
        makeAccountingJournal() as never,
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
        makeInventoryProducts() as never,
        makeAccountingTaxCodes() as never,
        makeAccountingJournal() as never,
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
        makeInventoryProducts() as never,
        makeAccountingTaxCodes() as never,
        makeAccountingJournal() as never,
      );

      await expect(service.listPayments(actor, 'inv1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('Sales Accounting Integration', () => {
    /** Full SalesInvoice row shape, mirrors PurchaseInvoicesService's own fullInvoiceHeader() fixture. */
    function fullInvoiceHeader(overrides: Record<string, unknown> = {}) {
      return {
        id: 'inv1',
        tenantId,
        invoiceNumber: 'INV-00000001',
        sourceType: null,
        sourceId: null,
        status: SalesInvoiceStatus.SENT,
        customerId: 'c1',
        customerName: 'Acme',
        billingAddress: null,
        shippingAddress: null,
        paymentTermId: null,
        salespersonId: null,
        invoiceDate: new Date(),
        dueDate: null,
        notes: null,
        subtotal: new Prisma.Decimal(0),
        discountTotal: new Prisma.Decimal(0),
        taxTotal: new Prisma.Decimal(0),
        total: new Prisma.Decimal(0),
        amountPaid: new Prisma.Decimal(0),
        paymentStatus: SalesInvoicePaymentStatus.UNPAID,
        sentAt: new Date(),
        accountingPostingStatus: SalesInvoicePostingStatus.NOT_POSTED,
        journalEntryId: null,
        reversalJournalEntryId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [],
        ...overrides,
      };
    }

    function buildSendService(
      prisma: unknown,
      accountingJournal?: unknown,
    ) {
      return new SalesInvoicesService(
        prisma as never,
        { require: jest.fn() } as never,
        { record: jest.fn().mockResolvedValue(undefined) } as never,
        makeEventBus() as never,
        makeInventoryProducts() as never,
        makeAccountingTaxCodes() as never,
        (accountingJournal ?? makeAccountingJournal()) as never,
      );
    }

    // ===================== posting-line construction (S1-S5) =====================

    it('S1. send() posts Dr Accounts Receivable / Cr Sales Revenue for a normal invoice with no discount and no tax', async () => {
      const draftRow = fullInvoiceHeader({
        status: SalesInvoiceStatus.DRAFT,
        items: [{ id: 'item1' }],
        subtotal: new Prisma.Decimal(100),
        total: new Prisma.Decimal(100),
      });
      const sentRow = { ...draftRow, status: SalesInvoiceStatus.SENT, items: [] };
      const prisma: any = {
        salesInvoice: {
          findFirst: jest.fn().mockResolvedValue(draftRow),
          // Reflects `data` — the SENT-transition update and the later
          // POSTED/journalEntryId update inside attemptInvoicePosting()
          // must not silently clobber each other.
          update: jest.fn(({ data }: any) => Promise.resolve({ ...sentRow, ...data })),
        },
      };
      const postMock = jest.fn().mockResolvedValue({
        id: 'je-1', entryNumber: 'JE-00000001', status: 'POSTED',
        sourceService: 'sales-service', sourceType: 'SALES_INVOICE', sourceId: 'inv1',
        reversesJournalEntryId: null, idempotentReplay: false, totalDebit: '100.0000', totalCredit: '100.0000',
      });
      const service = buildSendService(prisma, makeAccountingJournal({ post: postMock }));

      const result = await service.send(actor, 'inv1');

      expect(postMock).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          sourceService: 'sales-service',
          sourceType: 'SALES_INVOICE',
          sourceId: 'inv1',
          lines: [
            expect.objectContaining({ role: 'SALES_REVENUE', side: 'CREDIT', amount: '100.0000' }),
            expect.objectContaining({ role: 'ACCOUNTS_RECEIVABLE', side: 'DEBIT', amount: '100.0000' }),
          ],
        }),
      );
      expect(result.accountingPostingStatus).toBe(SalesInvoicePostingStatus.POSTED);
      expect(result.journalEntryId).toBe('je-1');
    });

    it('S2. send() with a discount posts Cr Sales Revenue at the gross subtotal and a separate Dr Sales Discount line (contra-revenue), never netted into Sales Revenue', async () => {
      const draftRow = fullInvoiceHeader({
        status: SalesInvoiceStatus.DRAFT,
        items: [{ id: 'item1' }],
        subtotal: new Prisma.Decimal(100),
        discountTotal: new Prisma.Decimal(10),
        total: new Prisma.Decimal(90),
      });
      const prisma: any = {
        salesInvoice: {
          findFirst: jest.fn().mockResolvedValue(draftRow),
          update: jest.fn().mockResolvedValue({ ...draftRow, status: SalesInvoiceStatus.SENT, items: [] }),
        },
      };
      const postMock = jest.fn().mockResolvedValue({
        id: 'je-2', entryNumber: 'JE-00000002', status: 'POSTED',
        sourceService: 'sales-service', sourceType: 'SALES_INVOICE', sourceId: 'inv1',
        reversesJournalEntryId: null, idempotentReplay: false, totalDebit: '90.0000', totalCredit: '90.0000',
      });
      const service = buildSendService(prisma, makeAccountingJournal({ post: postMock }));

      await service.send(actor, 'inv1');

      expect(postMock).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          lines: [
            expect.objectContaining({ role: 'SALES_REVENUE', side: 'CREDIT', amount: '100.0000' }),
            expect.objectContaining({ role: 'SALES_DISCOUNT', side: 'DEBIT', amount: '10.0000' }),
            expect.objectContaining({ role: 'ACCOUNTS_RECEIVABLE', side: 'DEBIT', amount: '90.0000' }),
          ],
        }),
      );
    });

    it('S2b. send() with discount AND tax posts four balanced lines: Cr Sales Revenue (gross) + Dr Sales Discount + Cr Output Tax = Dr Accounts Receivable', async () => {
      const draftRow = fullInvoiceHeader({
        status: SalesInvoiceStatus.DRAFT,
        items: [{ id: 'item1' }],
        subtotal: new Prisma.Decimal(100),
        discountTotal: new Prisma.Decimal(10),
        taxTotal: new Prisma.Decimal(18),
        total: new Prisma.Decimal(108),
      });
      const prisma: any = {
        salesInvoice: {
          findFirst: jest.fn().mockResolvedValue(draftRow),
          update: jest.fn().mockResolvedValue({ ...draftRow, status: SalesInvoiceStatus.SENT, items: [] }),
        },
      };
      const postMock = jest.fn().mockResolvedValue({
        id: 'je-2b', entryNumber: 'JE-00000002', status: 'POSTED',
        sourceService: 'sales-service', sourceType: 'SALES_INVOICE', sourceId: 'inv1',
        reversesJournalEntryId: null, idempotentReplay: false, totalDebit: '108.0000', totalCredit: '108.0000',
      });
      const service = buildSendService(prisma, makeAccountingJournal({ post: postMock }));

      await service.send(actor, 'inv1');

      expect(postMock).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          lines: [
            expect.objectContaining({ role: 'SALES_REVENUE', side: 'CREDIT', amount: '100.0000' }),
            expect.objectContaining({ role: 'SALES_DISCOUNT', side: 'DEBIT', amount: '10.0000' }),
            expect.objectContaining({ role: 'OUTPUT_TAX', side: 'CREDIT', amount: '18.0000' }),
            expect.objectContaining({ role: 'ACCOUNTS_RECEIVABLE', side: 'DEBIT', amount: '108.0000' }),
          ],
        }),
      );

      const lines = postMock.mock.calls[0][1].lines as Array<{ side: string; amount: string }>;
      expect(lines).toHaveLength(4);
      const debitTotal = lines
        .filter((l) => l.side === 'DEBIT')
        .reduce((sum, l) => sum + Number(l.amount), 0);
      const creditTotal = lines
        .filter((l) => l.side === 'CREDIT')
        .reduce((sum, l) => sum + Number(l.amount), 0);
      expect(debitTotal).toBe(creditTotal);
    });

    it('S2c. send() omits the SALES_DISCOUNT line entirely when discountTotal is zero (no zero-value discount line)', async () => {
      const draftRow = fullInvoiceHeader({
        status: SalesInvoiceStatus.DRAFT,
        items: [{ id: 'item1' }],
        subtotal: new Prisma.Decimal(100),
        total: new Prisma.Decimal(100),
      });
      const prisma: any = {
        salesInvoice: {
          findFirst: jest.fn().mockResolvedValue(draftRow),
          update: jest.fn().mockResolvedValue({ ...draftRow, status: SalesInvoiceStatus.SENT, items: [] }),
        },
      };
      const postMock = jest.fn().mockResolvedValue({
        id: 'je-2c', entryNumber: 'JE-00000002', status: 'POSTED',
        sourceService: 'sales-service', sourceType: 'SALES_INVOICE', sourceId: 'inv1',
        reversesJournalEntryId: null, idempotentReplay: false, totalDebit: '100.0000', totalCredit: '100.0000',
      });
      const service = buildSendService(prisma, makeAccountingJournal({ post: postMock }));

      await service.send(actor, 'inv1');

      const lines = postMock.mock.calls[0][1].lines as Array<{ role: string }>;
      expect(lines.some((l) => l.role === 'SALES_DISCOUNT')).toBe(false);
    });

    it('S3. send() omits the OUTPUT_TAX line entirely when taxTotal is zero', async () => {
      const draftRow = fullInvoiceHeader({
        status: SalesInvoiceStatus.DRAFT,
        items: [{ id: 'item1' }],
        subtotal: new Prisma.Decimal(50),
        total: new Prisma.Decimal(50),
      });
      const prisma: any = {
        salesInvoice: {
          findFirst: jest.fn().mockResolvedValue(draftRow),
          update: jest.fn().mockResolvedValue({ ...draftRow, status: SalesInvoiceStatus.SENT, items: [] }),
        },
      };
      const postMock = jest.fn().mockResolvedValue({
        id: 'je-3', entryNumber: 'JE-00000003', status: 'POSTED',
        sourceService: 'sales-service', sourceType: 'SALES_INVOICE', sourceId: 'inv1',
        reversesJournalEntryId: null, idempotentReplay: false, totalDebit: '50.0000', totalCredit: '50.0000',
      });
      const service = buildSendService(prisma, makeAccountingJournal({ post: postMock }));

      await service.send(actor, 'inv1');

      const lines = postMock.mock.calls[0][1].lines;
      expect(lines).toHaveLength(2);
      expect(lines.some((l: any) => l.role === 'OUTPUT_TAX')).toBe(false);
    });

    it('S4. send() with tax posts three balanced lines: Cr Sales Revenue + Cr Output Tax = Dr Accounts Receivable', async () => {
      const draftRow = fullInvoiceHeader({
        status: SalesInvoiceStatus.DRAFT,
        items: [{ id: 'item1' }],
        subtotal: new Prisma.Decimal(100),
        taxTotal: new Prisma.Decimal(18),
        total: new Prisma.Decimal(118),
      });
      const prisma: any = {
        salesInvoice: {
          findFirst: jest.fn().mockResolvedValue(draftRow),
          update: jest.fn().mockResolvedValue({ ...draftRow, status: SalesInvoiceStatus.SENT, items: [] }),
        },
      };
      const postMock = jest.fn().mockResolvedValue({
        id: 'je-4', entryNumber: 'JE-00000004', status: 'POSTED',
        sourceService: 'sales-service', sourceType: 'SALES_INVOICE', sourceId: 'inv1',
        reversesJournalEntryId: null, idempotentReplay: false, totalDebit: '118.0000', totalCredit: '118.0000',
      });
      const service = buildSendService(prisma, makeAccountingJournal({ post: postMock }));

      await service.send(actor, 'inv1');

      expect(postMock).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          lines: [
            expect.objectContaining({ role: 'SALES_REVENUE', side: 'CREDIT', amount: '100.0000' }),
            expect.objectContaining({ role: 'OUTPUT_TAX', side: 'CREDIT', amount: '18.0000' }),
            expect.objectContaining({ role: 'ACCOUNTS_RECEIVABLE', side: 'DEBIT', amount: '118.0000' }),
          ],
        }),
      );

      // S5: balanced-journal-request check — total debits === total credits,
      // computed generically from whatever lines were actually sent.
      const lines = postMock.mock.calls[0][1].lines as Array<{ side: string; amount: string }>;
      const debitTotal = lines
        .filter((l) => l.side === 'DEBIT')
        .reduce((sum, l) => sum + Number(l.amount), 0);
      const creditTotal = lines
        .filter((l) => l.side === 'CREDIT')
        .reduce((sum, l) => sum + Number(l.amount), 0);
      expect(debitTotal).toBe(creditTotal);
    });

    // ===================== send() accounting failure + retry (S6-S8) =====================

    it('S6. send() succeeds even when accounting posting fails: invoice stays SENT, accountingPostingStatus becomes FAILED, journalEntryId stays null', async () => {
      const draftRow = fullInvoiceHeader({
        status: SalesInvoiceStatus.DRAFT,
        items: [{ id: 'item1' }],
        subtotal: new Prisma.Decimal(100),
        total: new Prisma.Decimal(100),
      });
      const sentRow = { ...draftRow, status: SalesInvoiceStatus.SENT, items: [] };
      const failedRow = { ...sentRow, accountingPostingStatus: SalesInvoicePostingStatus.FAILED };
      const prisma: any = {
        salesInvoice: {
          // First call is send()'s own initial require() (must see DRAFT);
          // the second call is require() inside attemptInvoicePosting's
          // catch branch, reading back the final, reconciled FAILED state.
          findFirst: jest
            .fn()
            .mockResolvedValueOnce(draftRow)
            .mockResolvedValue(failedRow),
          update: jest.fn().mockResolvedValue(sentRow),
        },
      };
      const failingPost = jest.fn().mockRejectedValue(new Error('accounting service unreachable'));
      const service = buildSendService(prisma, makeAccountingJournal({ post: failingPost }));

      const result = await service.send(actor, 'inv1');

      expect(result.status).toBe(SalesInvoiceStatus.SENT);
      expect(result.accountingPostingStatus).toBe(SalesInvoicePostingStatus.FAILED);
      expect(result.journalEntryId).toBeNull();
    });

    it('S7. retryAccountingPosting() on a FAILED invoice successfully posts and transitions to POSTED', async () => {
      const existingPrisma: any = {
        salesInvoice: {
          findFirst: jest.fn().mockResolvedValue(
            fullInvoiceHeader({ accountingPostingStatus: SalesInvoicePostingStatus.FAILED }),
          ),
          update: jest.fn(({ data }: any) =>
            Promise.resolve(fullInvoiceHeader({ ...data })),
          ),
        },
      };
      const postMock = jest.fn().mockResolvedValue({
        id: 'je-retry', entryNumber: 'JE-00000020', status: 'POSTED',
        sourceService: 'sales-service', sourceType: 'SALES_INVOICE', sourceId: 'inv1',
        reversesJournalEntryId: null, idempotentReplay: false, totalDebit: '5.0000', totalCredit: '5.0000',
      });
      const service = buildSendService(existingPrisma, makeAccountingJournal({ post: postMock }));

      const result = await service.retryAccountingPosting(actor, 'inv1');

      expect(postMock).toHaveBeenCalledTimes(1);
      expect(result.accountingPostingStatus).toBe(SalesInvoicePostingStatus.POSTED);
      expect(result.journalEntryId).toBe('je-retry');
    });

    it('S7b. retryAccountingPosting() on a FAILED invoice that has a discount still includes the SALES_DISCOUNT line in the retried posting request', async () => {
      const discountInvoice = fullInvoiceHeader({
        accountingPostingStatus: SalesInvoicePostingStatus.FAILED,
        subtotal: new Prisma.Decimal(100),
        discountTotal: new Prisma.Decimal(10),
        total: new Prisma.Decimal(90),
      });
      const existingPrisma: any = {
        salesInvoice: {
          findFirst: jest.fn().mockResolvedValue(discountInvoice),
          update: jest.fn(({ data }: any) =>
            Promise.resolve({ ...discountInvoice, ...data }),
          ),
        },
      };
      const postMock = jest.fn().mockResolvedValue({
        id: 'je-retry-discount', entryNumber: 'JE-00000021', status: 'POSTED',
        sourceService: 'sales-service', sourceType: 'SALES_INVOICE', sourceId: 'inv1',
        reversesJournalEntryId: null, idempotentReplay: false, totalDebit: '90.0000', totalCredit: '90.0000',
      });
      const service = buildSendService(existingPrisma, makeAccountingJournal({ post: postMock }));

      const result = await service.retryAccountingPosting(actor, 'inv1');

      expect(postMock).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          lines: [
            expect.objectContaining({ role: 'SALES_REVENUE', side: 'CREDIT', amount: '100.0000' }),
            expect.objectContaining({ role: 'SALES_DISCOUNT', side: 'DEBIT', amount: '10.0000' }),
            expect.objectContaining({ role: 'ACCOUNTS_RECEIVABLE', side: 'DEBIT', amount: '90.0000' }),
          ],
        }),
      );
      expect(result.accountingPostingStatus).toBe(SalesInvoicePostingStatus.POSTED);
      expect(result.journalEntryId).toBe('je-retry-discount');
    });

    it('S8. calling retryAccountingPosting() on an already-POSTED invoice never calls accounting-service again (idempotent)', async () => {
      const alreadyPosted = fullInvoiceHeader({
        accountingPostingStatus: SalesInvoicePostingStatus.POSTED,
        journalEntryId: 'je-already-posted',
      });
      const prisma: any = { salesInvoice: { findFirst: jest.fn().mockResolvedValue(alreadyPosted) } };
      const postMock = jest.fn();
      const service = buildSendService(prisma, makeAccountingJournal({ post: postMock }));

      const first = await service.retryAccountingPosting(actor, 'inv1');
      const second = await service.retryAccountingPosting(actor, 'inv1');

      expect(postMock).not.toHaveBeenCalled();
      for (const result of [first, second]) {
        expect(result.accountingPostingStatus).toBe(SalesInvoicePostingStatus.POSTED);
        expect(result.journalEntryId).toBe('je-already-posted');
      }
    });

    it('retryAccountingPosting() on a CANCELLED invoice is rejected with 409 and never calls accounting-service', async () => {
      const prisma: any = {
        salesInvoice: {
          findFirst: jest.fn().mockResolvedValue(
            fullInvoiceHeader({
              status: SalesInvoiceStatus.CANCELLED,
              accountingPostingStatus: SalesInvoicePostingStatus.FAILED,
            }),
          ),
        },
      };
      const postMock = jest.fn();
      const service = buildSendService(prisma, makeAccountingJournal({ post: postMock }));

      await expect(service.retryAccountingPosting(actor, 'inv1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(postMock).not.toHaveBeenCalled();
    });

    // ===================== cancel() + reversal (S9-S13) =====================

    it('S9. cancel() on a SENT invoice whose posting is POSTED creates a reversal journal and transitions to REVERSED', async () => {
      const sentRow = fullInvoiceHeader({
        accountingPostingStatus: SalesInvoicePostingStatus.POSTED,
        journalEntryId: 'je-original',
      });
      const cancelledRow = { ...sentRow, status: SalesInvoiceStatus.CANCELLED };
      const prisma: any = {
        salesInvoice: {
          findFirst: jest.fn().mockResolvedValue(sentRow),
          // Reflects whatever `data` each call passes — the cancel-status
          // update and the later reversal-status update inside
          // attemptInvoiceReversal() must not silently clobber each other.
          update: jest.fn(({ data }: any) => Promise.resolve({ ...cancelledRow, ...data })),
        },
      };
      const reverseMock = jest.fn().mockResolvedValue({
        id: 'je-reversal', entryNumber: 'JE-00000011', status: 'POSTED',
        sourceService: 'sales-service', sourceType: 'SALES_INVOICE_CANCELLATION', sourceId: 'inv1',
        reversesJournalEntryId: 'je-original', idempotentReplay: false, totalDebit: '5.0000', totalCredit: '5.0000',
      });
      const service = buildSendService(prisma, makeAccountingJournal({ reverse: reverseMock }));

      const result = await service.cancel(actor, 'inv1');

      expect(reverseMock).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          sourceService: 'sales-service',
          sourceType: 'SALES_INVOICE',
          sourceId: 'inv1',
          reversalSourceType: 'SALES_INVOICE_CANCELLATION',
        }),
      );
      expect(result.status).toBe(SalesInvoiceStatus.CANCELLED);
      expect(result.accountingPostingStatus).toBe(SalesInvoicePostingStatus.REVERSED);
      expect(result.reversalJournalEntryId).toBe('je-reversal');
    });

    it('S9b. cancel() on a POSTED invoice that had a discount reverses correctly — the reversal call carries no line detail at all, since accounting-service mirrors whatever lines (including SALES_DISCOUNT) were actually persisted on the original journal, not whatever Sales resends', async () => {
      const sentRow = fullInvoiceHeader({
        accountingPostingStatus: SalesInvoicePostingStatus.POSTED,
        journalEntryId: 'je-original-with-discount',
        subtotal: new Prisma.Decimal(100),
        discountTotal: new Prisma.Decimal(10),
        total: new Prisma.Decimal(90),
      });
      const cancelledRow = { ...sentRow, status: SalesInvoiceStatus.CANCELLED };
      const prisma: any = {
        salesInvoice: {
          findFirst: jest.fn().mockResolvedValue(sentRow),
          update: jest.fn(({ data }: any) => Promise.resolve({ ...cancelledRow, ...data })),
        },
      };
      const reverseMock = jest.fn().mockResolvedValue({
        id: 'je-reversal-discount', entryNumber: 'JE-00000012', status: 'POSTED',
        sourceService: 'sales-service', sourceType: 'SALES_INVOICE_CANCELLATION', sourceId: 'inv1',
        reversesJournalEntryId: 'je-original-with-discount', idempotentReplay: false, totalDebit: '5.0000', totalCredit: '5.0000',
      });
      const service = buildSendService(prisma, makeAccountingJournal({ reverse: reverseMock }));

      const result = await service.cancel(actor, 'inv1');

      // No `lines` in the reversal request at all — attemptInvoiceReversal()
      // never rebuilds/resends line content; accounting-service reverses
      // whatever lines the ORIGINAL journal actually has (including
      // SALES_DISCOUNT), read back from its own persisted JournalEntry.
      const reverseArgs = reverseMock.mock.calls[0][1];
      expect(reverseArgs.lines).toBeUndefined();
      expect(result.accountingPostingStatus).toBe(SalesInvoicePostingStatus.REVERSED);
      expect(result.reversalJournalEntryId).toBe('je-reversal-discount');
    });

    it('S10. cancel() succeeds even when the accounting reversal fails: invoice is CANCELLED, accountingPostingStatus stays POSTED for reconciliation', async () => {
      const sentRow = fullInvoiceHeader({
        accountingPostingStatus: SalesInvoicePostingStatus.POSTED,
        journalEntryId: 'je-original',
      });
      const cancelledRow = { ...sentRow, status: SalesInvoiceStatus.CANCELLED };
      const prisma: any = {
        salesInvoice: {
          // Initial require() inside cancel() must see the pre-cancel SENT
          // state; the later require() inside attemptInvoiceReversal's catch
          // branch (after the failed reverse() call) reads back the final,
          // already-CANCELLED-but-still-POSTED state for reconciliation.
          findFirst: jest.fn().mockResolvedValueOnce(sentRow).mockResolvedValue(cancelledRow),
          update: jest.fn().mockResolvedValue(cancelledRow),
        },
      };
      const reverseMock = jest.fn().mockRejectedValue(new Error('accounting service unreachable'));
      const service = buildSendService(prisma, makeAccountingJournal({ reverse: reverseMock }));

      const result = await service.cancel(actor, 'inv1');

      expect(result.status).toBe(SalesInvoiceStatus.CANCELLED);
      expect(result.accountingPostingStatus).toBe(SalesInvoicePostingStatus.POSTED);
      expect(result.reversalJournalEntryId).toBeNull();
    });

    it('S11. retryAccountingReversal() on a CANCELLED invoice whose reversal previously failed succeeds and transitions to REVERSED', async () => {
      const prisma: any = {
        salesInvoice: {
          findFirst: jest.fn().mockResolvedValue(
            fullInvoiceHeader({
              status: SalesInvoiceStatus.CANCELLED,
              accountingPostingStatus: SalesInvoicePostingStatus.POSTED,
              journalEntryId: 'je-original',
            }),
          ),
          update: jest.fn(({ data }: any) =>
            Promise.resolve(
              fullInvoiceHeader({ status: SalesInvoiceStatus.CANCELLED, ...data }),
            ),
          ),
        },
      };
      const reverseMock = jest.fn().mockResolvedValue({
        id: 'je-reversal-retry', entryNumber: 'JE-00000050', status: 'POSTED',
        sourceService: 'sales-service', sourceType: 'SALES_INVOICE_CANCELLATION', sourceId: 'inv1',
        reversesJournalEntryId: 'je-original', idempotentReplay: false, totalDebit: '5.0000', totalCredit: '5.0000',
      });
      const service = buildSendService(prisma, makeAccountingJournal({ reverse: reverseMock }));

      const result = await service.retryAccountingReversal(actor, 'inv1');

      expect(reverseMock).toHaveBeenCalledTimes(1);
      expect(result.accountingPostingStatus).toBe(SalesInvoicePostingStatus.REVERSED);
      expect(result.reversalJournalEntryId).toBe('je-reversal-retry');
    });

    it('S12. retryAccountingReversal() on an already-REVERSED invoice is a no-op and never calls accounting-service again', async () => {
      const prisma: any = {
        salesInvoice: {
          findFirst: jest.fn().mockResolvedValue(
            fullInvoiceHeader({
              status: SalesInvoiceStatus.CANCELLED,
              accountingPostingStatus: SalesInvoicePostingStatus.REVERSED,
              journalEntryId: 'je-original',
              reversalJournalEntryId: 'je-reversal-existing',
            }),
          ),
        },
      };
      const reverseMock = jest.fn();
      const service = buildSendService(prisma, makeAccountingJournal({ reverse: reverseMock }));

      const result = await service.retryAccountingReversal(actor, 'inv1');

      expect(reverseMock).not.toHaveBeenCalled();
      expect(result.reversalJournalEntryId).toBe('je-reversal-existing');
    });

    it('retryAccountingReversal() on a non-CANCELLED invoice is rejected with 409 and never calls accounting-service', async () => {
      const prisma: any = {
        salesInvoice: {
          findFirst: jest.fn().mockResolvedValue(
            fullInvoiceHeader({
              status: SalesInvoiceStatus.SENT,
              accountingPostingStatus: SalesInvoicePostingStatus.POSTED,
              journalEntryId: 'je-original',
            }),
          ),
        },
      };
      const reverseMock = jest.fn();
      const service = buildSendService(prisma, makeAccountingJournal({ reverse: reverseMock }));

      await expect(service.retryAccountingReversal(actor, 'inv1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(reverseMock).not.toHaveBeenCalled();
    });

    it('S13. cancel() on an invoice whose posting was never successful (FAILED or NOT_POSTED) never attempts a reversal, and retryAccountingReversal() rejects it with 409', async () => {
      for (const priorStatus of [
        SalesInvoicePostingStatus.FAILED,
        SalesInvoicePostingStatus.NOT_POSTED,
      ]) {
        const sentRow = fullInvoiceHeader({ accountingPostingStatus: priorStatus });
        const cancelledRow = { ...sentRow, status: SalesInvoiceStatus.CANCELLED };
        const prisma: any = {
          salesInvoice: {
            // First call: cancel()'s own initial require() (must see SENT).
            // Every call after that (including the later
            // retryAccountingReversal() below) sees the already-CANCELLED row.
            findFirst: jest.fn().mockResolvedValueOnce(sentRow).mockResolvedValue(cancelledRow),
            update: jest.fn().mockResolvedValue(cancelledRow),
          },
        };
        const reverseMock = jest.fn();
        const service = buildSendService(prisma, makeAccountingJournal({ reverse: reverseMock }));

        const result = await service.cancel(actor, 'inv1');
        expect(reverseMock).not.toHaveBeenCalled();
        expect(result.accountingPostingStatus).toBe(priorStatus);

        await expect(service.retryAccountingReversal(actor, 'inv1')).rejects.toBeInstanceOf(
          ConflictException,
        );
      }
    });

    // ===================== tenant isolation (S14) =====================

    it('S14. retryAccountingPosting() and retryAccountingReversal() return 404 for a missing/cross-tenant invoice, scoped by tenantId', async () => {
      const findFirst = jest.fn().mockResolvedValue(null);
      const prisma: any = { salesInvoice: { findFirst } };
      const service = buildSendService(prisma, makeAccountingJournal());

      await expect(service.retryAccountingPosting(actor, 'inv1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.retryAccountingReversal(actor, 'inv1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      for (const call of findFirst.mock.calls) {
        expect(call[0].where).toEqual(
          expect.objectContaining({ id: 'inv1', tenantId }),
        );
      }
    });

    // ===================== Customer Payment (P1-P4) =====================

    function fullPaymentRow(overrides: Record<string, unknown> = {}) {
      return {
        id: 'pay1',
        tenantId,
        salesInvoiceId: 'inv1',
        amount: new Prisma.Decimal(40),
        paymentDate: new Date('2026-01-15'),
        paymentMethodId: null,
        reference: null,
        notes: null,
        accountingPostingStatus: SalesPaymentPostingStatus.NOT_POSTED,
        journalEntryId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
      };
    }

    function buildPaymentHarness(options: {
      invoice: Record<string, unknown>;
      createdPayment: Record<string, unknown>;
      accountingJournal?: unknown;
    }) {
      const queryRawMock = jest.fn().mockResolvedValue([{ id: 'inv1' }]);
      const findFirstOrThrowMock = jest.fn().mockResolvedValue(options.invoice);
      const createPaymentMock = jest.fn().mockResolvedValue(options.createdPayment);
      const updateInvoiceMock = jest.fn().mockImplementation(
        ({ data }: { data: Record<string, unknown> }) => ({
          ...options.invoice,
          items: [],
          ...data,
        }),
      );
      const tx = {
        $queryRaw: queryRawMock,
        salesInvoice: { findFirstOrThrow: findFirstOrThrowMock, update: updateInvoiceMock },
        salesPayment: { create: createPaymentMock },
      };
      const paymentUpdateMock = jest.fn().mockImplementation((args: { data: Record<string, unknown> }) => ({
        ...options.createdPayment,
        ...args.data,
      }));
      const paymentFindFirstOrThrowMock = jest.fn().mockResolvedValue(options.createdPayment);
      const prisma = {
        $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)),
        salesPayment: { update: paymentUpdateMock, findFirstOrThrow: paymentFindFirstOrThrowMock },
      };
      const service = new SalesInvoicesService(
        prisma as never,
        { require: jest.fn() } as never,
        { record: jest.fn().mockResolvedValue(undefined) } as never,
        makeEventBus() as never,
        makeInventoryProducts() as never,
        makeAccountingTaxCodes() as never,
        (options.accountingJournal ?? makeAccountingJournal()) as never,
      );
      return { service, paymentUpdateMock };
    }

    it('P1. a Customer Payment with a paymentMethodId posts successfully: Dr Payment Method / Cr Accounts Receivable', async () => {
      const invoice = fullInvoiceHeader({ total: new Prisma.Decimal(100), amountPaid: new Prisma.Decimal(0) });
      const postMock = jest.fn().mockResolvedValue({
        id: 'je-payment', entryNumber: 'JE-00000040', status: 'POSTED',
        sourceService: 'sales-service', sourceType: 'CUSTOMER_PAYMENT', sourceId: 'pay1',
        reversesJournalEntryId: null, idempotentReplay: false, totalDebit: '40.0000', totalCredit: '40.0000',
      });
      const { service } = buildPaymentHarness({
        invoice,
        createdPayment: fullPaymentRow({ paymentMethodId: 'pm-1' }),
        accountingJournal: makeAccountingJournal({ post: postMock }),
      });

      const result = await service.recordPayment(actor, 'inv1', {
        amount: '40',
        paymentDate: '2026-01-15',
        paymentMethodId: 'pm-1',
      });

      expect(postMock).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          sourceService: 'sales-service',
          sourceType: 'CUSTOMER_PAYMENT',
          sourceId: 'pay1',
          lines: [
            expect.objectContaining({ role: 'PAYMENT_METHOD', side: 'DEBIT', amount: '40.0000', paymentMethodId: 'pm-1' }),
            expect.objectContaining({ role: 'ACCOUNTS_RECEIVABLE', side: 'CREDIT', amount: '40.0000' }),
          ],
        }),
      );
      expect(result.payment.accountingPostingStatus).toBe(SalesPaymentPostingStatus.POSTED);
      expect(result.payment.journalEntryId).toBe('je-payment');
    });

    it('P2. a Customer Payment with no paymentMethodId is marked FAILED without ever calling accounting-service', async () => {
      const invoice = fullInvoiceHeader({ total: new Prisma.Decimal(100), amountPaid: new Prisma.Decimal(0) });
      const postMock = jest.fn();
      const { service } = buildPaymentHarness({
        invoice,
        createdPayment: fullPaymentRow({ paymentMethodId: null }),
        accountingJournal: makeAccountingJournal({ post: postMock }),
      });

      const result = await service.recordPayment(actor, 'inv1', {
        amount: '40',
        paymentDate: '2026-01-15',
      });

      expect(postMock).not.toHaveBeenCalled();
      expect(result.payment.accountingPostingStatus).toBe(SalesPaymentPostingStatus.FAILED);
    });

    it('P3. a Customer Payment whose PAYMENT_METHOD mapping cannot be resolved is marked FAILED — the already-committed payment is never rolled back', async () => {
      const invoice = fullInvoiceHeader({ total: new Prisma.Decimal(100), amountPaid: new Prisma.Decimal(0) });
      // Simulates accounting-service rejecting the posting because no
      // AccountMapping exists for this PaymentMethod (BadRequestException
      // surfaces to the client as a rethrown error, exactly like any other
      // accounting-service failure — Sales never resolves the mapping itself).
      const postMock = jest.fn().mockRejectedValue(new Error('No account mapping configured for PAYMENT_METHOD'));
      const { service } = buildPaymentHarness({
        invoice,
        createdPayment: fullPaymentRow({ paymentMethodId: 'pm-unmapped' }),
        accountingJournal: makeAccountingJournal({ post: postMock }),
      });

      const result = await service.recordPayment(actor, 'inv1', {
        amount: '40',
        paymentDate: '2026-01-15',
        paymentMethodId: 'pm-unmapped',
      });

      expect(postMock).toHaveBeenCalledTimes(1);
      expect(result.payment.accountingPostingStatus).toBe(SalesPaymentPostingStatus.FAILED);
      // The Sales-side payment record itself is untouched by the accounting failure.
      expect(result.invoice.amountPaid).toBe('40.0000');
    });

    it('P4. a second payment on the same invoice posts its own independent accounting journal', async () => {
      const invoice = fullInvoiceHeader({ total: new Prisma.Decimal(100), amountPaid: new Prisma.Decimal(40) });
      const postMock = jest.fn().mockResolvedValue({
        id: 'je-payment-2', entryNumber: 'JE-00000041', status: 'POSTED',
        sourceService: 'sales-service', sourceType: 'CUSTOMER_PAYMENT', sourceId: 'pay2',
        reversesJournalEntryId: null, idempotentReplay: false, totalDebit: '60.0000', totalCredit: '60.0000',
      });
      const { service } = buildPaymentHarness({
        invoice,
        createdPayment: fullPaymentRow({ id: 'pay2', amount: new Prisma.Decimal(60), paymentMethodId: 'pm-1' }),
        accountingJournal: makeAccountingJournal({ post: postMock }),
      });

      const result = await service.recordPayment(actor, 'inv1', {
        amount: '60',
        paymentDate: '2026-01-20',
        paymentMethodId: 'pm-1',
      });

      expect(postMock).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({ sourceId: 'pay2' }),
      );
      expect(result.payment.journalEntryId).toBe('je-payment-2');
    });
  });
});
