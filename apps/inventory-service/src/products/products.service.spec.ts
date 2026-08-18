import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma-client';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const categoryId = '33333333-aaaa-4aaa-8aaa-333333333333';
  const unitId = '44444444-aaaa-4aaa-8aaa-444444444444';

  function row(overrides: Record<string, unknown> = {}) {
    return {
      id: '55555555-aaaa-4aaa-8aaa-555555555555',
      tenantId: actor.tenantId,
      sku: 'SKU-001',
      name: 'Widget',
      description: null,
      categoryId,
      unitOfMeasureId: unitId,
      sellingPrice: new Prisma.Decimal('19.9900'),
      costPrice: new Prisma.Decimal('10.0000'),
      isActive: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      ...overrides,
    };
  }

  function createService() {
    const prisma = {
      product: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      category: { findFirst: jest.fn() },
      unitOfMeasure: { findFirst: jest.fn() },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new ProductsService(
      prisma as never,
      audit as unknown as IdentityAuditClient,
    );
    return { service, prisma, audit };
  }

  function mockRefs(prisma: ReturnType<typeof createService>['prisma']) {
    prisma.category.findFirst.mockResolvedValue({ id: categoryId });
    prisma.unitOfMeasure.findFirst.mockResolvedValue({ id: unitId });
  }

  it('creates a product with decimal prices and product.created audit', async () => {
    const { service, prisma, audit } = createService();
    mockRefs(prisma);
    prisma.product.create.mockResolvedValue(row());

    const result = await service.create(actor, {
      sku: 'sku-001',
      name: 'Widget',
      categoryId,
      unitOfMeasureId: unitId,
      sellingPrice: '19.99',
      costPrice: '10',
    });

    expect(result.sellingPrice).toBe('19.9900');
    expect(typeof result.sellingPrice).toBe('string');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'product.created',
        metadata: { sku: 'SKU-001', name: 'Widget' },
      }),
    );
    const metadata = (audit.record as jest.Mock).mock.calls[0][0]
      .metadata as Record<string, unknown>;
    expect(metadata).not.toHaveProperty('password');
    expect(metadata).not.toHaveProperty('accessToken');
  });

  it('rejects a duplicate SKU', async () => {
    const { service, prisma } = createService();
    mockRefs(prisma);
    prisma.product.create.mockRejectedValue({ code: 'P2002' });
    await expect(
      service.create(actor, {
        sku: 'SKU-001',
        name: 'Widget',
        categoryId,
        unitOfMeasureId: unitId,
        sellingPrice: '1',
        costPrice: '1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lists only the actor tenant', async () => {
    const { service, prisma } = createService();
    prisma.product.findMany.mockResolvedValue([row()]);
    await service.list(actor);
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: { tenantId: actor.tenantId },
      orderBy: { sku: 'asc' },
    });
  });

  it('gets a product in the actor tenant', async () => {
    const { service, prisma } = createService();
    prisma.product.findFirst.mockResolvedValue(row());
    await expect(service.getById(actor, row().id)).resolves.toMatchObject({
      sku: 'SKU-001',
    });
  });

  it('updates a product and writes product.updated', async () => {
    const { service, prisma, audit } = createService();
    prisma.product.findFirst.mockResolvedValue(row());
    prisma.product.update.mockResolvedValue(row({ name: 'Gadget' }));
    await service.update(actor, row().id, { name: 'Gadget' });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'product.updated' }),
    );
  });

  it('returns 404 for another tenant product', async () => {
    const { service, prisma } = createService();
    prisma.product.findFirst.mockResolvedValue(null);
    await expect(service.getById(actor, row().id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
