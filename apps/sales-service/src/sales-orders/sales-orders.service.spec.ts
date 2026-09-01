import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  Prisma,
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

  function decimal(value: string) {
    return new Prisma.Decimal(value);
  }

  function orderRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'so1',
      tenantId,
      customerId: 'c1',
      quotationId: null,
      status: SalesOrderStatus.DRAFT,
      customerName: 'Acme',
      billingAddress: 'Bill',
      shippingAddress: 'Ship',
      notes: null,
      subtotal: decimal('50'),
      total: decimal('50'),
      confirmedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [
        {
          id: 'soi1',
          tenantId,
          salesOrderId: 'so1',
          productId,
          productSku: 'SKU-1',
          productName: 'Widget',
          quantity: decimal('10'),
          unitPrice: decimal('5'),
          lineTotal: decimal('50'),
          shippedQuantity: decimal('0'),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      ...overrides,
    };
  }

  it('creates sales order with customer snapshot and zero shipped qty', async () => {
    const customer = {
      id: 'c1',
      tenantId,
      name: 'Acme',
      street: 'Bill',
      street2: null,
      city: 'Springfield',
      zip: '10001',
      state: 'IL',
      country: 'US',
    };
    const created = orderRow();
    const prisma = {
      salesOrder: { create: jest.fn().mockResolvedValue(created) },
    };
    const customers = {
      require: jest.fn().mockResolvedValue(customer),
    } as unknown as CustomersService;
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new SalesOrdersService(
      prisma as never,
      customers,
      audit as never,
    );

    const result = await service.create(actor, {
      customerId: 'c1',
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
  });

  it('rejects update when not DRAFT', async () => {
    const prisma = {
      salesOrder: {
        findFirst: jest
          .fn()
          .mockResolvedValue(orderRow({ status: SalesOrderStatus.CONFIRMED })),
      },
    };
    const service = new SalesOrdersService(
      prisma as never,
      { require: jest.fn() } as never,
      { record: jest.fn() } as never,
    );
    await expect(
      service.update(actor, 'so1', { notes: 'x' }),
    ).rejects.toBeInstanceOf(ConflictException);
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
    const service = new SalesOrdersService(
      prisma as never,
      { require: jest.fn() } as never,
      audit as never,
    );
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
    const service = new SalesOrdersService(
      prisma as never,
      { require: jest.fn() } as never,
      audit as never,
    );
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
    const service = new SalesOrdersService(
      prisma as never,
      { require: jest.fn() } as never,
      audit as never,
    );
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
    const service = new SalesOrdersService(
      prisma as never,
      { require: jest.fn() } as never,
      { record: jest.fn() } as never,
    );
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
    const service = new SalesOrdersService(
      prisma as never,
      { require: jest.fn() } as never,
      { record: jest.fn() } as never,
    );
    await expect(service.cancel(actor, 'so1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('scopes getById to tenant', async () => {
    const prisma = {
      salesOrder: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new SalesOrdersService(
      prisma as never,
      { require: jest.fn() } as never,
      { record: jest.fn() } as never,
    );
    await expect(service.getById(actor, 'so1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.salesOrder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'so1', tenantId },
      }),
    );
  });

  it('converts ACCEPTED quotation into DRAFT sales order', async () => {
    const quotation = {
      id: 'q1',
      tenantId,
      status: QuotationStatus.ACCEPTED,
      customerId: 'c1',
      customerName: 'Acme',
      billingAddress: 'Bill',
      shippingAddress: 'Ship',
      notes: 'n',
      subtotal: decimal('50'),
      total: decimal('50'),
      items: [
        {
          productId,
          productSku: 'SKU-1',
          productName: 'Widget',
          quantity: decimal('10'),
          unitPrice: decimal('5'),
          lineTotal: decimal('50'),
        },
      ],
    };
    const created = orderRow({ quotationId: 'q1' });
    const prisma = {
      quotation: { findFirst: jest.fn().mockResolvedValue(quotation) },
      salesOrder: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(created),
      },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new SalesOrdersService(
      prisma as never,
      { require: jest.fn() } as never,
      audit as never,
    );
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
    const service = new SalesOrdersService(
      prisma as never,
      { require: jest.fn() } as never,
      { record: jest.fn() } as never,
    );
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
    const service = new SalesOrdersService(
      prisma as never,
      { require: jest.fn() } as never,
      { record: jest.fn() } as never,
    );
    await expect(
      service.convertFromQuotation(actor, 'q1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
