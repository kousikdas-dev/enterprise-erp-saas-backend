import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { QuotationStatus } from '../../generated/prisma-client';
import { QuotationsService } from './quotations.service';

describe('QuotationsService', () => {
  const tenantA = '11111111-1111-4111-8111-111111111111';
  const tenantB = '22222222-2222-4222-8222-222222222222';
  const actorA = { userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', tenantId: tenantA };
  const productId = '33333333-3333-4333-8333-333333333333';
  const baseUnitOfMeasureId = '99999999-9999-4999-8999-999999999999';
  const altUnitOfMeasureId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const taxCodeId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  function mockCustomer(overrides: Record<string, unknown> = {}) {
    return {
      id: '44444444-4444-4444-8444-444444444444',
      tenantId: tenantA,
      code: 'CUST1',
      name: 'Acme',
      street: 'Bill St',
      street2: null,
      city: 'Springfield',
      zip: '10001',
      state: 'IL',
      country: 'US',
      email: null,
      phone: null,
      salespersonId: '55555555-5555-4555-8555-555555555555',
      paymentTermId: '66666666-6666-4666-8666-666666666666',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  function defaultUomOptions(overrides: Record<string, unknown> = {}) {
    return {
      productId,
      trackInventory: true,
      base: { unitOfMeasureId: baseUnitOfMeasureId, code: 'EA', name: 'Each' },
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

  function itemRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'qi1',
      tenantId: tenantA,
      quotationId: 'q1',
      productId,
      productSku: 'SKU-1',
      productName: 'Widget',
      quantity: { toFixed: () => '10.000000' },
      unitOfMeasureId: baseUnitOfMeasureId,
      uomCode: 'EA',
      uomName: 'Each',
      conversionFactor: { toFixed: () => '1.000000' },
      unitPrice: { toFixed: () => '5.0000' },
      discountPercent: { toFixed: () => '0.00' },
      discountAmount: { toFixed: () => '0.0000' },
      taxCodeId: null,
      taxCode: null,
      taxCodeName: null,
      taxAmount: { toFixed: () => '0.0000' },
      lineSubtotal: { toFixed: () => '50.0000' },
      lineTotal: { toFixed: () => '50.0000' },
      createdAt: new Date(),
      updatedAt: new Date(),
      taxComponents: [],
      ...overrides,
    };
  }

  function quotationRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'q1',
      tenantId: tenantA,
      customerId: '44444444-4444-4444-8444-444444444444',
      status: QuotationStatus.DRAFT,
      customerName: 'Acme',
      billingAddress: null,
      shippingAddress: null,
      notes: null,
      paymentTermId: null,
      salespersonId: null,
      deliveryDate: null,
      subtotal: { toFixed: () => '50.0000' },
      discountTotal: { toFixed: () => '0.0000' },
      taxTotal: { toFixed: () => '0.0000' },
      total: { toFixed: () => '50.0000' },
      validUntil: null,
      sentAt: null,
      acceptedAt: null,
      rejectedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [itemRow()],
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
    return new QuotationsService(
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
      unitOfMeasureId: baseUnitOfMeasureId,
      unitPrice: '5.0000',
      ...overrides,
    };
  }

  it('rejects update when quotation is not DRAFT', async () => {
    const prisma = {
      quotation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'q1',
          tenantId: tenantA,
          status: QuotationStatus.SENT,
          items: [],
        }),
      },
    };
    const service = createService({ prisma });
    await expect(
      service.update(actorA, 'q1', { notes: 'x' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects accept unless SENT', async () => {
    const prisma = {
      quotation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'q1',
          tenantId: tenantA,
          status: QuotationStatus.DRAFT,
          items: [{ id: 'i1' }],
        }),
      },
    };
    const service = createService({ prisma });
    await expect(service.accept(actorA, 'q1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects reject unless SENT', async () => {
    const prisma = {
      quotation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'q1',
          tenantId: tenantA,
          status: QuotationStatus.ACCEPTED,
          items: [],
        }),
      },
    };
    const service = createService({ prisma });
    await expect(service.reject(actorA, 'q1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('creates quotation with customer snapshot and line totals', async () => {
    const customer = mockCustomer();
    const prisma = {
      quotation: {
        create: jest.fn().mockResolvedValue(
          quotationRow({ customerId: customer.id, customerName: customer.name }),
        ),
      },
    };
    const customers = { require: jest.fn().mockResolvedValue(customer) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = createService({ prisma, customers, audit });

    const result = await service.create(actorA, {
      customerId: customer.id,
      items: [baseItemInput()],
    });

    expect(customers.require).toHaveBeenCalledWith(actorA, customer.id);
    expect(prisma.quotation.create).toHaveBeenCalled();
    expect(result.customerName).toBe('Acme');
    expect(result.items[0].lineTotal).toBe('50.0000');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'quotation.created' }),
    );
  });

  it('defaults paymentTermId/salespersonId from the customer and stores deliveryDate', async () => {
    const customer = mockCustomer();
    const prisma = {
      quotation: {
        create: jest.fn().mockResolvedValue(
          quotationRow({
            customerId: customer.id,
            customerName: customer.name,
            paymentTermId: customer.paymentTermId,
            salespersonId: customer.salespersonId,
            deliveryDate: new Date('2026-09-15'),
          }),
        ),
      },
    };
    const customers = { require: jest.fn().mockResolvedValue(customer) };
    const service = createService({ prisma, customers });

    await service.create(actorA, {
      customerId: customer.id,
      deliveryDate: '2026-09-15',
      items: [baseItemInput()],
    });

    const data = (prisma.quotation.create as jest.Mock).mock.calls[0][0].data;
    expect(data.paymentTermId).toBe(customer.paymentTermId);
    expect(data.salespersonId).toBe(customer.salespersonId);
    expect(data.deliveryDate).toEqual(new Date('2026-09-15'));
  });

  it('lets an explicit paymentTermId/salespersonId override the customer default', async () => {
    const customer = mockCustomer();
    const overridePaymentTermId = '77777777-7777-4777-8777-777777777777';
    const overrideSalespersonId = '88888888-8888-4888-8888-888888888888';
    const prisma = {
      quotation: {
        create: jest.fn().mockResolvedValue(
          quotationRow({
            customerId: customer.id,
            customerName: customer.name,
            paymentTermId: overridePaymentTermId,
            salespersonId: overrideSalespersonId,
          }),
        ),
      },
    };
    const customers = { require: jest.fn().mockResolvedValue(customer) };
    const service = createService({ prisma, customers });

    await service.create(actorA, {
      customerId: customer.id,
      paymentTermId: overridePaymentTermId,
      salespersonId: overrideSalespersonId,
      items: [baseItemInput()],
    });

    const data = (prisma.quotation.create as jest.Mock).mock.calls[0][0].data;
    expect(data.paymentTermId).toBe(overridePaymentTermId);
    expect(data.salespersonId).toBe(overrideSalespersonId);
  });

  it('scopes getById to actor tenant', async () => {
    const prisma = {
      quotation: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const service = createService({ prisma });
    await expect(service.getById(actorA, 'q1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.quotation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'q1', tenantId: tenantA },
      }),
    );
    void tenantB;
  });

  describe('UOM/discount/tax calculation', () => {
    function customerAndPrisma() {
      const customer = mockCustomer();
      const prisma = {
        quotation: {
          create: jest.fn().mockResolvedValue(quotationRow()),
        },
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

      await service.create(actorA, {
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

      const item = (prisma.quotation.create as jest.Mock).mock.calls[0][0].data
        .items.create[0];
      expect(item.discountAmount.toFixed(4)).toBe('5.0000');
      expect(item.lineSubtotal.toFixed(4)).toBe('45.0000');
      expect(item.taxAmount.toFixed(4)).toBe('4.0500');
      expect(item.lineTotal.toFixed(4)).toBe('49.0500');
      expect(accountingTaxCodes.getById).toHaveBeenCalledWith(actorA, taxCodeId);
    });

    it('sums multi-component tax (CGST + SGST) independently against lineSubtotal', async () => {
      const { customer, prisma, customers } = customerAndPrisma();
      const accountingTaxCodes = defaultAccountingTaxCodes({
        getById: jest.fn().mockResolvedValue(taxCodeResponse()),
      });
      const service = createService({ prisma, customers, accountingTaxCodes });

      await service.create(actorA, {
        customerId: customer.id,
        items: [
          baseItemInput({ quantity: '10', unitPrice: '5.0000', taxCodeId }),
        ],
      });

      const item = (prisma.quotation.create as jest.Mock).mock.calls[0][0].data
        .items.create[0];
      expect(item.taxComponents.create).toHaveLength(2);
      expect(
        item.taxComponents.create.map((c: { componentTaxAmount: { toFixed: (n: number) => string } }) =>
          c.componentTaxAmount.toFixed(4),
        ),
      ).toEqual(['4.5000', '4.5000']);
      expect(item.taxAmount.toFixed(4)).toBe('9.0000');
      expect(item.lineTotal.toFixed(4)).toBe('59.0000');
    });

    it('defaults discountPercent to 0 and taxAmount to 0 when neither is provided', async () => {
      const { customer, prisma, customers } = customerAndPrisma();
      const service = createService({ prisma, customers });

      await service.create(actorA, {
        customerId: customer.id,
        items: [baseItemInput({ quantity: '10', unitPrice: '5.0000' })],
      });

      const item = (prisma.quotation.create as jest.Mock).mock.calls[0][0].data
        .items.create[0];
      expect(item.discountPercent.toFixed(2)).toBe('0.00');
      expect(item.discountAmount.toFixed(4)).toBe('0.0000');
      expect(item.taxAmount.toFixed(4)).toBe('0.0000');
      expect(item.taxCodeId).toBeNull();
      expect(item.taxComponents.create).toEqual([]);
    });

    it('snapshots productTracksInventory from inventory-service (Phase 3.3)', async () => {
      const { customer, prisma, customers } = customerAndPrisma();
      const inventoryProducts = defaultInventoryProducts({
        getUomOptions: jest
          .fn()
          .mockResolvedValue(defaultUomOptions({ trackInventory: false })),
      });
      const service = createService({ prisma, customers, inventoryProducts });

      await service.create(actorA, {
        customerId: customer.id,
        items: [baseItemInput({ quantity: '10', unitPrice: '5.0000' })],
      });

      const item = (prisma.quotation.create as jest.Mock).mock.calls[0][0].data
        .items.create[0];
      expect(item.productTracksInventory).toBe(false);
    });

    it('does not call AccountingTaxCodeClient when no taxCodeId is provided', async () => {
      const { customer, prisma, customers } = customerAndPrisma();
      const accountingTaxCodes = defaultAccountingTaxCodes();
      const service = createService({ prisma, customers, accountingTaxCodes });

      await service.create(actorA, {
        customerId: customer.id,
        items: [baseItemInput()],
      });

      expect(accountingTaxCodes.getById).not.toHaveBeenCalled();
    });

    it('rounds gross using HALF_UP to 4 decimal places', async () => {
      const { customer, prisma, customers } = customerAndPrisma();
      const service = createService({ prisma, customers });

      await service.create(actorA, {
        customerId: customer.id,
        items: [
          baseItemInput({ quantity: '1.5', unitPrice: '3.3335' }),
        ],
      });

      const item = (prisma.quotation.create as jest.Mock).mock.calls[0][0].data
        .items.create[0];
      // 1.5 * 3.3335 = 5.00025 -> HALF_UP to 4dp = 5.0003
      expect(item.lineSubtotal.toFixed(4)).toBe('5.0003');
      expect(item.lineTotal.toFixed(4)).toBe('5.0003');
    });

    it('accepts the base unit of measure and snapshots conversionFactor as 1', async () => {
      const { customer, prisma, customers } = customerAndPrisma();
      const inventoryProducts = defaultInventoryProducts();
      const service = createService({ prisma, customers, inventoryProducts });

      await service.create(actorA, {
        customerId: customer.id,
        items: [baseItemInput({ unitOfMeasureId: baseUnitOfMeasureId })],
      });

      const item = (prisma.quotation.create as jest.Mock).mock.calls[0][0].data
        .items.create[0];
      expect(item.unitOfMeasureId).toBe(baseUnitOfMeasureId);
      expect(item.uomCode).toBe('EA');
      expect(item.conversionFactor.toFixed(6)).toBe('1.000000');
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

      await service.create(actorA, {
        customerId: customer.id,
        items: [baseItemInput({ unitOfMeasureId: altUnitOfMeasureId })],
      });

      const item = (prisma.quotation.create as jest.Mock).mock.calls[0][0].data
        .items.create[0];
      expect(item.unitOfMeasureId).toBe(altUnitOfMeasureId);
      expect(item.uomCode).toBe('BOX');
      expect(item.uomName).toBe('Box of 12');
      expect(item.conversionFactor.toFixed(6)).toBe('12.000000');
    });

    it('rejects a unitOfMeasureId that is neither the base unit nor an active alternative', async () => {
      const { customer, prisma, customers } = customerAndPrisma();
      const service = createService({ prisma, customers });

      await expect(
        service.create(actorA, {
          customerId: customer.id,
          items: [
            baseItemInput({ unitOfMeasureId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' }),
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('propagates a 404 when the product/UOM cannot be resolved (e.g. cross-tenant product)', async () => {
      const { customer, prisma, customers } = customerAndPrisma();
      const inventoryProducts = defaultInventoryProducts({
        getUomOptions: jest
          .fn()
          .mockRejectedValue(new NotFoundException('Product not found')),
      });
      const service = createService({ prisma, customers, inventoryProducts });

      await expect(
        service.create(actorA, {
          customerId: customer.id,
          items: [baseItemInput()],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('propagates a 404 when the selected tax code cannot be resolved (e.g. cross-tenant tax code)', async () => {
      const { customer, prisma, customers } = customerAndPrisma();
      const accountingTaxCodes = defaultAccountingTaxCodes({
        getById: jest
          .fn()
          .mockRejectedValue(new NotFoundException('Tax code not found')),
      });
      const service = createService({ prisma, customers, accountingTaxCodes });

      await expect(
        service.create(actorA, {
          customerId: customer.id,
          items: [baseItemInput({ taxCodeId })],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
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

      await service.create(actorA, {
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

      const data = (prisma.quotation.create as jest.Mock).mock.calls[0][0].data;
      expect(data.subtotal.toFixed(4)).toBe('100.0000');
      expect(data.discountTotal.toFixed(4)).toBe('5.0000');
      expect(data.taxTotal.toFixed(4)).toBe('4.0500');
      expect(data.total.toFixed(4)).toBe('99.0500');
    });
  });

  describe('snapshot immutability on read', () => {
    it('does not call InventoryProductClient or AccountingTaxCodeClient when reading an existing quotation', async () => {
      const prisma = {
        quotation: {
          findFirst: jest.fn().mockResolvedValue(quotationRow()),
        },
      };
      const inventoryProducts = defaultInventoryProducts();
      const accountingTaxCodes = defaultAccountingTaxCodes();
      const service = createService({ prisma, inventoryProducts, accountingTaxCodes });

      await service.getById(actorA, 'q1');

      expect(inventoryProducts.getUomOptions).not.toHaveBeenCalled();
      expect(accountingTaxCodes.getById).not.toHaveBeenCalled();
    });
  });
});
