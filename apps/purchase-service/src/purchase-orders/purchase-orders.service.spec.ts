import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, PurchaseOrderStatus } from '../../generated/prisma-client';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { PurchaseOrdersService } from './purchase-orders.service';

describe('PurchaseOrdersService', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const supplierId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const productId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  function order(overrides: Record<string, unknown> = {}) {
    return {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      tenantId: actor.tenantId,
      supplierId,
      status: PurchaseOrderStatus.DRAFT,
      notes: null,
      orderDate: new Date('2026-01-01'),
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      items: [
        {
          id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          tenantId: actor.tenantId,
          purchaseOrderId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          productId,
          quantity: new Prisma.Decimal('10'),
          unitCost: new Prisma.Decimal('5.0000'),
          receivedQuantity: new Prisma.Decimal('0'),
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
      ],
      ...overrides,
    };
  }

  function createService() {
    const prisma = {
      supplier: { findFirst: jest.fn() },
      purchaseOrder: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      purchaseOrderItem: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (fn: (client: typeof prisma) => Promise<unknown>) => fn(prisma),
    );
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new PurchaseOrdersService(
      prisma as never,
      audit as unknown as IdentityAuditClient,
    );
    return { service, prisma, audit };
  }

  it('creates a draft purchase order', async () => {
    const { service, prisma, audit } = createService();
    prisma.supplier.findFirst.mockResolvedValue({ id: supplierId });
    prisma.purchaseOrder.create.mockResolvedValue(order());
    const result = await service.create(actor, {
      supplierId,
      items: [{ productId, quantity: '10', unitCost: '5' }],
    });
    expect(result.status).toBe(PurchaseOrderStatus.DRAFT);
    expect(result.items[0].quantity).toBe('10.000000');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'purchase-order.created' }),
    );
  });

  it('confirms a draft order', async () => {
    const { service, prisma, audit } = createService();
    prisma.purchaseOrder.findFirst.mockResolvedValue(order());
    prisma.purchaseOrder.update.mockResolvedValue(
      order({ status: PurchaseOrderStatus.CONFIRMED }),
    );
    const result = await service.confirm(actor, order().id);
    expect(result.status).toBe(PurchaseOrderStatus.CONFIRMED);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'purchase-order.confirmed' }),
    );
  });

  it('rejects update when not DRAFT', async () => {
    const { service, prisma } = createService();
    prisma.purchaseOrder.findFirst.mockResolvedValue(
      order({ status: PurchaseOrderStatus.CONFIRMED }),
    );
    await expect(
      service.update(actor, order().id, { notes: 'x' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns 404 for another tenant order', async () => {
    const { service, prisma } = createService();
    prisma.purchaseOrder.findFirst.mockResolvedValue(null);
    await expect(service.getById(actor, order().id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
