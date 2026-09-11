import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  ProformaInvoiceStatus,
  QuotationStatus,
  SalesOrderStatus,
  ShipmentStatus,
} from '../../generated/prisma-client';
import { CustomersService } from '../customers/customers.service';
import { SalesOrdersService } from './sales-orders.service';

describe('SalesOrdersService', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const actor = {
    userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    tenantId,
  };
  const productId = '33333333-3333-4333-8333-333333333333';
  const unitOfMeasureId = '99999999-9999-4999-8999-999999999999';
  const altUnitOfMeasureId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const taxCodeId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  function decimal(value: string) {
    return new Prisma.Decimal(value);
  }

  function mockCustomer(overrides: Record<string, unknown> = {}) {
    return {
      id: 'c1',
      tenantId,
      code: 'CUST1',
      name: 'Acme',
      street: 'Bill St',
      street2: null,
      city: 'Springfield',
      zip: '10001',
      state: 'IL',
      country: 'US',
      salespersonId: '55555555-5555-4555-8555-555555555555',
      paymentTermId: '66666666-6666-4666-8666-666666666666',
      ...overrides,
    };
  }

  function defaultUomOptions(overrides: Record<string, unknown> = {}) {
    return {
      productId,
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
      customers?: unknown;
      audit?: unknown;
      inventoryProducts?: unknown;
      accountingTaxCodes?: unknown;
    } = {},
  ) {
    return new SalesOrdersService(
      (deps.prisma ?? {}) as never,
      (deps.customers ?? { require: jest.fn() }) as never,
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

  function orderItemRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'soi1',
      tenantId,
      salesOrderId: 'so1',
      productId,
      productSku: 'SKU-1',
      productName: 'Widget',
      quantity: decimal('10'),
      unitOfMeasureId,
      uomCode: 'EA',
      uomName: 'Each',
      conversionFactor: decimal('1'),
      unitPrice: decimal('5'),
      discountPercent: decimal('0'),
      discountAmount: decimal('0'),
      taxCodeId: null,
      taxCode: null,
      taxCodeName: null,
      taxAmount: decimal('0'),
      lineSubtotal: decimal('50'),
      lineTotal: decimal('50'),
      shippedQuantity: decimal('0'),
      createdAt: new Date(),
      updatedAt: new Date(),
      taxComponents: [],
      ...overrides,
    };
  }

  function orderRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'so1',
      tenantId,
      customerId: 'c1',
      quotationId: null,
      proformaInvoiceId: null,
      status: SalesOrderStatus.DRAFT,
      customerName: 'Acme',
      billingAddress: 'Bill',
      shippingAddress: 'Ship',
      notes: null,
      paymentTermId: null,
      salespersonId: null,
      deliveryDate: null,
      subtotal: decimal('50'),
      discountTotal: decimal('0'),
      taxTotal: decimal('0'),
      total: decimal('50'),
      confirmedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [orderItemRow()],
      ...overrides,
    };
  }

  /** A QuotationItem/ProformaInvoiceItem-shaped source row with UOM/discount/tax snapshot fields and taxComponents. */
  function snapshotSourceItem(overrides: Record<string, unknown> = {}) {
    return {
      productId,
      productSku: 'SKU-1',
      productName: 'Widget',
      quantity: decimal('10'),
      unitOfMeasureId,
      uomCode: 'EA',
      uomName: 'Each',
      conversionFactor: decimal('1'),
      unitPrice: decimal('5'),
      discountPercent: decimal('10'),
      discountAmount: decimal('5'),
      taxCodeId,
      taxCode: 'GST18',
      taxCodeName: 'GST 18%',
      taxAmount: decimal('8.1'),
      lineSubtotal: decimal('45'),
      lineTotal: decimal('53.1'),
      taxComponents: [
        {
          sequence: 1,
          type: 'CGST',
          name: null,
          rate: decimal('9'),
          componentTaxAmount: decimal('4.05'),
        },
        {
          sequence: 2,
          type: 'SGST',
          name: null,
          rate: decimal('9'),
          componentTaxAmount: decimal('4.05'),
        },
      ],
      ...overrides,
    };
  }

  it('creates sales order with customer snapshot, resolved UOM and zero shipped qty', async () => {
    const customer = mockCustomer();
    const created = orderRow();
    const prisma = {
      salesOrder: { create: jest.fn().mockResolvedValue(created) },
    };
    const customers = {
      require: jest.fn().mockResolvedValue(customer),
    } as unknown as CustomersService;
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = createService({ prisma, customers, audit });

    const result = await service.create(actor, {
      customerId: 'c1',
      items: [baseItemInput()],
    });

    expect(result.customerName).toBe('Acme');
    expect(result.items[0].orderedQuantity).toBe('10.000000');
    expect(result.items[0].shippedQuantity).toBe('0.000000');
    expect(result.items[0].remainingQuantity).toBe('10.000000');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'sales-order.created',
        metadata: expect.objectContaining({ source: 'manual' }),
      }),
    );

    const data = (prisma.salesOrder.create as jest.Mock).mock.calls[0][0].data;
    expect(data.items.create[0].unitOfMeasureId).toBe(unitOfMeasureId);
    expect(data.items.create[0].uomCode).toBe('EA');
  });

  it('defaults paymentTermId/salespersonId from the customer and stores deliveryDate', async () => {
    const customer = mockCustomer();
    const prisma = {
      salesOrder: { create: jest.fn().mockResolvedValue(orderRow()) },
    };
    const customers = { require: jest.fn().mockResolvedValue(customer) };
    const service = createService({ prisma, customers });

    await service.create(actor, {
      customerId: customer.id,
      deliveryDate: '2026-09-15',
      items: [baseItemInput()],
    });

    const data = (prisma.salesOrder.create as jest.Mock).mock.calls[0][0].data;
    expect(data.paymentTermId).toBe(customer.paymentTermId);
    expect(data.salespersonId).toBe(customer.salespersonId);
    expect(data.deliveryDate).toEqual(new Date('2026-09-15'));
  });

  it('lets an explicit paymentTermId/salespersonId override the customer default', async () => {
    const customer = mockCustomer();
    const overridePaymentTermId = '77777777-7777-4777-8777-777777777777';
    const overrideSalespersonId = '88888888-8888-4888-8888-888888888888';
    const prisma = {
      salesOrder: { create: jest.fn().mockResolvedValue(orderRow()) },
    };
    const customers = { require: jest.fn().mockResolvedValue(customer) };
    const service = createService({ prisma, customers });

    await service.create(actor, {
      customerId: customer.id,
      paymentTermId: overridePaymentTermId,
      salespersonId: overrideSalespersonId,
      items: [baseItemInput()],
    });

    const data = (prisma.salesOrder.create as jest.Mock).mock.calls[0][0].data;
    expect(data.paymentTermId).toBe(overridePaymentTermId);
    expect(data.salespersonId).toBe(overrideSalespersonId);
  });

  it('rejects update when not DRAFT', async () => {
    const prisma = {
      salesOrder: {
        findFirst: jest
          .fn()
          .mockResolvedValue(orderRow({ status: SalesOrderStatus.CONFIRMED })),
      },
    };
    const service = createService({ prisma });
    await expect(
      service.update(actor, 'so1', { notes: 'x' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('recomputes discountTotal/taxTotal from the replaced items on update', async () => {
    const updated = orderRow({ items: [] });
    const updateMock = jest.fn().mockResolvedValue(updated);
    const createItemMock = jest.fn().mockResolvedValue(undefined);
    const tx = {
      salesOrder: { update: updateMock },
      salesOrderItem: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: createItemMock,
      },
    };
    const prisma = {
      salesOrder: { findFirst: jest.fn().mockResolvedValue(orderRow()) },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)),
    };
    const accountingTaxCodes = defaultAccountingTaxCodes({
      getById: jest.fn().mockResolvedValue(taxCodeResponse()),
    });
    const service = createService({ prisma, accountingTaxCodes });

    await service.update(actor, 'so1', {
      items: [
        baseItemInput({ quantity: '10', unitPrice: '5.0000', discountPercent: '10', taxCodeId }),
      ],
    });

    expect(createItemMock).toHaveBeenCalledTimes(1);
    const data = updateMock.mock.calls[0][0].data;
    // gross = 50; discount 10% = 5; lineSubtotal = 45; tax 18% of 45 = 8.1
    expect(data.discountTotal.toFixed(4)).toBe('5.0000');
    expect(data.taxTotal.toFixed(4)).toBe('8.1000');
    expect(data.total.toFixed(4)).toBe('53.1000');
  });

  it('confirms DRAFT sales order', async () => {
    const confirmed = orderRow({
      status: SalesOrderStatus.CONFIRMED,
      confirmedAt: new Date(),
    });
    const prisma = {
      salesOrder: {
        findFirst: jest.fn().mockResolvedValue(orderRow()),
        update: jest.fn().mockResolvedValue(confirmed),
      },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = createService({ prisma, audit });
    const result = await service.confirm(actor, 'so1');
    expect(result.status).toBe(SalesOrderStatus.CONFIRMED);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'sales-order.confirmed' }),
    );
  });

  it('cancels DRAFT sales order', async () => {
    const cancelled = orderRow({ status: SalesOrderStatus.CANCELLED });
    const prisma = {
      salesOrder: {
        findFirst: jest.fn().mockResolvedValue(orderRow()),
        update: jest.fn().mockResolvedValue(cancelled),
      },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = createService({ prisma, audit });
    const result = await service.cancel(actor, 'so1');
    expect(result.status).toBe(SalesOrderStatus.CANCELLED);
  });

  it('cancels CONFIRMED sales order when no POSTED shipments', async () => {
    const cancelled = orderRow({ status: SalesOrderStatus.CANCELLED });
    const prisma = {
      salesOrder: {
        findFirst: jest
          .fn()
          .mockResolvedValue(orderRow({ status: SalesOrderStatus.CONFIRMED })),
        update: jest.fn().mockResolvedValue(cancelled),
      },
      shipment: { count: jest.fn().mockResolvedValue(0) },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = createService({ prisma, audit });
    await service.cancel(actor, 'so1');
    expect(prisma.shipment.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: ShipmentStatus.POSTED }),
      }),
    );
  });

  it('rejects cancel CONFIRMED when POSTED shipments exist', async () => {
    const prisma = {
      salesOrder: {
        findFirst: jest
          .fn()
          .mockResolvedValue(orderRow({ status: SalesOrderStatus.CONFIRMED })),
      },
      shipment: { count: jest.fn().mockResolvedValue(1) },
    };
    const service = createService({ prisma });
    await expect(service.cancel(actor, 'so1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects cancel PARTIALLY_FULFILLED', async () => {
    const prisma = {
      salesOrder: {
        findFirst: jest.fn().mockResolvedValue(
          orderRow({ status: SalesOrderStatus.PARTIALLY_FULFILLED }),
        ),
      },
    };
    const service = createService({ prisma });
    await expect(service.cancel(actor, 'so1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('scopes getById to tenant', async () => {
    const prisma = {
      salesOrder: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = createService({ prisma });
    await expect(service.getById(actor, 'so1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.salesOrder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'so1', tenantId },
      }),
    );
  });

  describe('convertFromQuotation', () => {
    it('converts an ACCEPTED quotation into a DRAFT sales order and copies UOM/discount/tax and header snapshot fields verbatim', async () => {
      const item = snapshotSourceItem();
      const quotation = {
        id: 'q1',
        tenantId,
        status: QuotationStatus.ACCEPTED,
        customerId: 'c1',
        customerName: 'Acme',
        billingAddress: 'Bill',
        shippingAddress: 'Ship',
        notes: 'n',
        paymentTermId: '66666666-6666-4666-8666-666666666666',
        salespersonId: '55555555-5555-4555-8555-555555555555',
        deliveryDate: new Date('2026-09-20'),
        subtotal: decimal('50'),
        discountTotal: decimal('5'),
        taxTotal: decimal('8.1'),
        total: decimal('53.1'),
        items: [item],
      };
      const created = orderRow({
        quotationId: 'q1',
        paymentTermId: quotation.paymentTermId,
        salespersonId: quotation.salespersonId,
        deliveryDate: quotation.deliveryDate,
      });
      const createMock = jest.fn().mockResolvedValue(created);
      const prisma = {
        quotation: { findFirst: jest.fn().mockResolvedValue(quotation) },
        salesOrder: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: createMock,
        },
      };
      const audit = { record: jest.fn().mockResolvedValue(undefined) };
      const service = createService({ prisma, audit });
      const result = await service.convertFromQuotation(actor, 'q1');
      expect(result.quotationId).toBe('q1');
      expect(result.status).toBe(SalesOrderStatus.DRAFT);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'sales-order.created',
          metadata: expect.objectContaining({
            source: 'quotation',
            quotationId: 'q1',
          }),
        }),
      );

      const data = createMock.mock.calls[0][0].data;
      expect(data.discountTotal).toBe(quotation.discountTotal);
      expect(data.taxTotal).toBe(quotation.taxTotal);
      expect(data.paymentTermId).toBe(quotation.paymentTermId);
      expect(data.salespersonId).toBe(quotation.salespersonId);
      expect(data.deliveryDate).toBe(quotation.deliveryDate);
      const createdItem = data.items.create[0];
      expect(createdItem.unitOfMeasureId).toBe(item.unitOfMeasureId);
      expect(createdItem.conversionFactor).toBe(item.conversionFactor);
      expect(createdItem.discountAmount).toBe(item.discountAmount);
      expect(createdItem.taxCodeId).toBe(item.taxCodeId);
      expect(createdItem.taxAmount).toBe(item.taxAmount);
      expect(createdItem.lineSubtotal).toBe(item.lineSubtotal);
      expect(createdItem.shippedQuantity.toFixed(6)).toBe('0.000000');
      expect(createdItem.taxComponents.create).toHaveLength(2);
      expect(createdItem.taxComponents.create[0].rate).toBe(
        item.taxComponents[0].rate,
      );
    });

    it('rejects conversion when quotation is not ACCEPTED', async () => {
      const prisma = {
        quotation: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'q1',
            tenantId,
            status: QuotationStatus.SENT,
            items: [{ id: 'i1' }],
          }),
        },
      };
      const service = createService({ prisma });
      await expect(
        service.convertFromQuotation(actor, 'q1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects duplicate quotation conversion', async () => {
      const prisma = {
        quotation: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'q1',
            tenantId,
            status: QuotationStatus.ACCEPTED,
            items: [{ id: 'i1' }],
          }),
        },
        salesOrder: {
          findFirst: jest.fn().mockResolvedValue(orderRow({ quotationId: 'q1' })),
        },
      };
      const service = createService({ prisma });
      await expect(
        service.convertFromQuotation(actor, 'q1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('convertFromProforma', () => {
    it('converts an ISSUED proforma invoice into a DRAFT sales order and copies UOM/discount/tax snapshot fields verbatim', async () => {
      const item = snapshotSourceItem();
      const proforma = {
        id: 'pf1',
        tenantId,
        status: ProformaInvoiceStatus.ISSUED,
        customerId: 'c1',
        customerName: 'Acme',
        billingAddress: 'Bill',
        shippingAddress: 'Ship',
        notes: 'n',
        subtotal: decimal('50'),
        discountTotal: decimal('5'),
        taxTotal: decimal('8.1'),
        total: decimal('53.1'),
        items: [item],
      };
      const created = orderRow({ proformaInvoiceId: 'pf1' });
      const createMock = jest.fn().mockResolvedValue(created);
      const prisma = {
        proformaInvoice: { findFirst: jest.fn().mockResolvedValue(proforma) },
        salesOrder: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: createMock,
        },
      };
      const audit = { record: jest.fn().mockResolvedValue(undefined) };
      const service = createService({ prisma, audit });
      const result = await service.convertFromProforma(actor, 'pf1');
      expect(result.proformaInvoiceId).toBe('pf1');
      expect(result.status).toBe(SalesOrderStatus.DRAFT);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'sales-order.created',
          metadata: expect.objectContaining({
            source: 'proforma-invoice',
            proformaInvoiceId: 'pf1',
          }),
        }),
      );

      const data = createMock.mock.calls[0][0].data;
      expect(data.discountTotal).toBe(proforma.discountTotal);
      expect(data.taxTotal).toBe(proforma.taxTotal);
      const createdItem = data.items.create[0];
      expect(createdItem.unitOfMeasureId).toBe(item.unitOfMeasureId);
      expect(createdItem.discountAmount).toBe(item.discountAmount);
      expect(createdItem.taxCodeId).toBe(item.taxCodeId);
      expect(createdItem.taxComponents.create).toHaveLength(2);
    });

    it('rejects conversion when proforma invoice is not ISSUED', async () => {
      const prisma = {
        proformaInvoice: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'pf1',
            tenantId,
            status: ProformaInvoiceStatus.DRAFT,
            items: [{ id: 'i1' }],
          }),
        },
      };
      const service = createService({ prisma });
      await expect(
        service.convertFromProforma(actor, 'pf1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects conversion when proforma invoice has no items', async () => {
      const prisma = {
        proformaInvoice: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'pf1',
            tenantId,
            status: ProformaInvoiceStatus.ISSUED,
            items: [],
          }),
        },
      };
      const service = createService({ prisma });
      await expect(
        service.convertFromProforma(actor, 'pf1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects duplicate proforma invoice conversion', async () => {
      const prisma = {
        proformaInvoice: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'pf1',
            tenantId,
            status: ProformaInvoiceStatus.ISSUED,
            items: [{ id: 'i1' }],
          }),
        },
        salesOrder: {
          findFirst: jest
            .fn()
            .mockResolvedValue(orderRow({ proformaInvoiceId: 'pf1' })),
        },
      };
      const service = createService({ prisma });
      await expect(
        service.convertFromProforma(actor, 'pf1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects when the proforma invoice does not exist', async () => {
      const prisma = {
        proformaInvoice: { findFirst: jest.fn().mockResolvedValue(null) },
      };
      const service = createService({ prisma });
      await expect(
        service.convertFromProforma(actor, 'pf1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('UOM/discount/tax calculation', () => {
    function customerAndPrisma() {
      const customer = mockCustomer();
      const prisma = {
        salesOrder: { create: jest.fn().mockResolvedValue(orderRow()) },
      };
      const customers = { require: jest.fn().mockResolvedValue(customer) };
      return { customer, prisma, customers };
    }

    it('computes gross, discount, lineSubtotal, tax and lineTotal for a discounted, single-component-tax line', async () => {
      const { customer, prisma, customers } = customerAndPrisma();
      const accountingTaxCodes = defaultAccountingTaxCodes({
        getById: jest.fn().mockResolvedValue(
          taxCodeResponse({
            components: [
              { id: 'comp-1', sequence: 1, type: 'CGST', name: null, rate: '9.0000' },
            ],
          }),
        ),
      });
      const service = createService({ prisma, customers, accountingTaxCodes });

      await service.create(actor, {
        customerId: customer.id,
        items: [
          baseItemInput({
            quantity: '10',
            unitPrice: '5.0000',
            discountPercent: '10',
            taxCodeId,
          }),
        ],
      });

      const item = (prisma.salesOrder.create as jest.Mock).mock.calls[0][0]
        .data.items.create[0];
      expect(item.discountAmount.toFixed(4)).toBe('5.0000');
      expect(item.lineSubtotal.toFixed(4)).toBe('45.0000');
      expect(item.taxAmount.toFixed(4)).toBe('4.0500');
      expect(item.lineTotal.toFixed(4)).toBe('49.0500');
      expect(accountingTaxCodes.getById).toHaveBeenCalledWith(actor, taxCodeId);
    });

    it('sums multi-component tax (CGST + SGST) independently against lineSubtotal', async () => {
      const { customer, prisma, customers } = customerAndPrisma();
      const accountingTaxCodes = defaultAccountingTaxCodes({
        getById: jest.fn().mockResolvedValue(taxCodeResponse()),
      });
      const service = createService({ prisma, customers, accountingTaxCodes });

      await service.create(actor, {
        customerId: customer.id,
        items: [baseItemInput({ quantity: '10', unitPrice: '5.0000', taxCodeId })],
      });

      const item = (prisma.salesOrder.create as jest.Mock).mock.calls[0][0]
        .data.items.create[0];
      expect(item.taxComponents.create).toHaveLength(2);
      expect(item.taxAmount.toFixed(4)).toBe('9.0000');
      expect(item.lineTotal.toFixed(4)).toBe('59.0000');
    });

    it('defaults discountPercent to 0 and taxAmount to 0 when neither is provided', async () => {
      const { customer, prisma, customers } = customerAndPrisma();
      const service = createService({ prisma, customers });

      await service.create(actor, {
        customerId: customer.id,
        items: [baseItemInput({ quantity: '10', unitPrice: '5.0000' })],
      });

      const item = (prisma.salesOrder.create as jest.Mock).mock.calls[0][0]
        .data.items.create[0];
      expect(item.discountPercent.toFixed(2)).toBe('0.00');
      expect(item.discountAmount.toFixed(4)).toBe('0.0000');
      expect(item.taxAmount.toFixed(4)).toBe('0.0000');
      expect(item.taxCodeId).toBeNull();
      expect(item.taxComponents.create).toEqual([]);
    });

    it('accepts an active ProductUnit alternative and snapshots its conversionFactor', async () => {
      const { customer, prisma, customers } = customerAndPrisma();
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
      const service = createService({ prisma, customers, inventoryProducts });

      await service.create(actor, {
        customerId: customer.id,
        items: [baseItemInput({ unitOfMeasureId: altUnitOfMeasureId })],
      });

      const item = (prisma.salesOrder.create as jest.Mock).mock.calls[0][0]
        .data.items.create[0];
      expect(item.unitOfMeasureId).toBe(altUnitOfMeasureId);
      expect(item.uomCode).toBe('BOX');
      expect(item.conversionFactor.toFixed(6)).toBe('12.000000');
    });

    it('rejects a unitOfMeasureId that is neither the base unit nor an active alternative', async () => {
      const { customer, prisma, customers } = customerAndPrisma();
      const service = createService({ prisma, customers });

      await expect(
        service.create(actor, {
          customerId: customer.id,
          items: [
            baseItemInput({ unitOfMeasureId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' }),
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('computes document discountTotal/taxTotal/total across multiple lines', async () => {
      const { customer, prisma, customers } = customerAndPrisma();
      const accountingTaxCodes = defaultAccountingTaxCodes({
        getById: jest.fn().mockResolvedValue(
          taxCodeResponse({
            components: [
              { id: 'comp-1', sequence: 1, type: 'CGST', name: null, rate: '9.0000' },
            ],
          }),
        ),
      });
      const service = createService({ prisma, customers, accountingTaxCodes });

      await service.create(actor, {
        customerId: customer.id,
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

      const data = (prisma.salesOrder.create as jest.Mock).mock.calls[0][0].data;
      expect(data.subtotal.toFixed(4)).toBe('100.0000');
      expect(data.discountTotal.toFixed(4)).toBe('5.0000');
      expect(data.taxTotal.toFixed(4)).toBe('4.0500');
      expect(data.total.toFixed(4)).toBe('99.0500');
    });
  });
});
