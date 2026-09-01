import { ConflictException, NotFoundException } from '@nestjs/common';
import { QuotationStatus } from '../../generated/prisma-client';
import { CustomersService } from '../customers/customers.service';
import { QuotationsService } from './quotations.service';

describe('QuotationsService', () => {
  const tenantA = '11111111-1111-4111-8111-111111111111';
  const tenantB = '22222222-2222-4222-8222-222222222222';
  const actorA = { userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', tenantId: tenantA };
  const productId = '33333333-3333-4333-8333-333333333333';

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
    const customers = { require: jest.fn() } as unknown as CustomersService;
    const audit = { record: jest.fn() };
    const service = new QuotationsService(
      prisma as never,
      customers,
      audit as never,
    );
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
    const service = new QuotationsService(
      prisma as never,
      { require: jest.fn() } as never,
      { record: jest.fn() } as never,
    );
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
    const service = new QuotationsService(
      prisma as never,
      { require: jest.fn() } as never,
      { record: jest.fn() } as never,
    );
    await expect(service.reject(actorA, 'q1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('creates quotation with customer snapshot and line totals', async () => {
    const customer = mockCustomer();
    const created = {
      id: 'q1',
      tenantId: tenantA,
      customerId: customer.id,
      status: QuotationStatus.DRAFT,
      customerName: customer.name,
      billingAddress: 'Bill St, Springfield, IL, 10001, US',
      shippingAddress: 'Bill St, Springfield, IL, 10001, US',
      notes: null,
      subtotal: { toFixed: () => '50.0000' },
      total: { toFixed: () => '50.0000' },
      validUntil: null,
      sentAt: null,
      acceptedAt: null,
      rejectedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [
        {
          id: 'qi1',
          tenantId: tenantA,
          quotationId: 'q1',
          productId,
          productSku: 'SKU-1',
          productName: 'Widget',
          quantity: { toFixed: () => '10.000000' },
          unitPrice: { toFixed: () => '5.0000' },
          lineTotal: { toFixed: () => '50.0000' },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    };
    const prisma = {
      quotation: {
        create: jest.fn().mockResolvedValue(created),
      },
    };
    const customers = {
      require: jest.fn().mockResolvedValue(customer),
    } as unknown as CustomersService;
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new QuotationsService(
      prisma as never,
      customers,
      audit as never,
    );

    const result = await service.create(actorA, {
      customerId: customer.id,
      items: [
        {
          productId,
          productSku: 'SKU-1',
          productName: 'Widget',
          quantity: '10',
          unitPrice: '5.0000',
        },
      ],
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
        create: jest.fn().mockResolvedValue({
          id: 'q1',
          tenantId: tenantA,
          customerId: customer.id,
          status: QuotationStatus.DRAFT,
          customerName: customer.name,
          billingAddress: null,
          shippingAddress: null,
          notes: null,
          paymentTermId: customer.paymentTermId,
          salespersonId: customer.salespersonId,
          deliveryDate: new Date('2026-09-15'),
          subtotal: { toFixed: () => '50.0000' },
          total: { toFixed: () => '50.0000' },
          validUntil: null,
          sentAt: null,
          acceptedAt: null,
          rejectedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          items: [],
        }),
      },
    };
    const customers = {
      require: jest.fn().mockResolvedValue(customer),
    } as unknown as CustomersService;
    const service = new QuotationsService(
      prisma as never,
      customers,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
    );

    await service.create(actorA, {
      customerId: customer.id,
      deliveryDate: '2026-09-15',
      items: [
        {
          productId,
          productSku: 'SKU-1',
          productName: 'Widget',
          quantity: '10',
          unitPrice: '5.0000',
        },
      ],
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
        create: jest.fn().mockResolvedValue({
          id: 'q1',
          tenantId: tenantA,
          customerId: customer.id,
          status: QuotationStatus.DRAFT,
          customerName: customer.name,
          billingAddress: null,
          shippingAddress: null,
          notes: null,
          paymentTermId: overridePaymentTermId,
          salespersonId: overrideSalespersonId,
          deliveryDate: null,
          subtotal: { toFixed: () => '50.0000' },
          total: { toFixed: () => '50.0000' },
          validUntil: null,
          sentAt: null,
          acceptedAt: null,
          rejectedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          items: [],
        }),
      },
    };
    const customers = {
      require: jest.fn().mockResolvedValue(customer),
    } as unknown as CustomersService;
    const service = new QuotationsService(
      prisma as never,
      customers,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
    );

    await service.create(actorA, {
      customerId: customer.id,
      paymentTermId: overridePaymentTermId,
      salespersonId: overrideSalespersonId,
      items: [
        {
          productId,
          productSku: 'SKU-1',
          productName: 'Widget',
          quantity: '10',
          unitPrice: '5.0000',
        },
      ],
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
    const service = new QuotationsService(
      prisma as never,
      { require: jest.fn() } as never,
      { record: jest.fn() } as never,
    );
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
});
