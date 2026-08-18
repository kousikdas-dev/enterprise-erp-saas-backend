import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const otherTenantId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  function row(overrides: Record<string, unknown> = {}) {
    return {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      tenantId: actor.tenantId,
      name: 'Finished Goods',
      description: null,
      isActive: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      ...overrides,
    };
  }

  function createService() {
    const prisma = {
      category: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new CategoriesService(
      prisma as never,
      audit as unknown as IdentityAuditClient,
    );
    return { service, prisma, audit };
  }

  it('creates a category and writes category.created without secrets', async () => {
    const { service, prisma, audit } = createService();
    prisma.category.create.mockResolvedValue(row());

    const result = await service.create(actor, { name: 'Finished Goods' });

    expect(prisma.category.create).toHaveBeenCalledWith({
      data: {
        tenantId: actor.tenantId,
        name: 'Finished Goods',
        description: null,
      },
    });
    expect(result.name).toBe('Finished Goods');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'category.created',
        resource: 'category',
        metadata: expect.not.objectContaining({
          password: expect.anything(),
          accessToken: expect.anything(),
        }),
      }),
    );
  });

  it('rejects a duplicate category name', async () => {
    const { service, prisma } = createService();
    prisma.category.create.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.create(actor, { name: 'Finished Goods' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lists only the actor tenant', async () => {
    const { service, prisma } = createService();
    prisma.category.findMany.mockResolvedValue([row()]);

    await service.list(actor);

    expect(prisma.category.findMany).toHaveBeenCalledWith({
      where: { tenantId: actor.tenantId },
      orderBy: { name: 'asc' },
    });
  });

  it('gets a category in the actor tenant', async () => {
    const { service, prisma } = createService();
    prisma.category.findFirst.mockResolvedValue(row());

    await expect(service.getById(actor, row().id)).resolves.toMatchObject({
      name: 'Finished Goods',
    });
  });

  it('updates a category and writes category.updated', async () => {
    const { service, prisma, audit } = createService();
    prisma.category.findFirst.mockResolvedValue(row());
    prisma.category.update.mockResolvedValue(row({ name: 'Raw' }));

    await service.update(actor, row().id, { name: 'Raw' });

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'category.updated' }),
    );
  });

  it('rejects an empty update', async () => {
    const { service, prisma } = createService();
    prisma.category.findFirst.mockResolvedValue(row());
    await expect(service.update(actor, row().id, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('returns 404 for another tenant category', async () => {
    const { service, prisma } = createService();
    prisma.category.findFirst.mockResolvedValue(null);

    await expect(
      service.getById(actor, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        tenantId: actor.tenantId,
      },
    });
    expect(otherTenantId).not.toBe(actor.tenantId);
  });
});
