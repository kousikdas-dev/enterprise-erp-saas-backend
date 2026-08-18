import { ConflictException, NotFoundException } from '@nestjs/common';
import { TenantStatus } from '../../generated/prisma-client';
import { AuditService } from '../audit/audit.service';
import { TenantsService } from './tenants.service';

describe('TenantsService', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const otherTenantId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  function tenantRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: actor.tenantId,
      name: 'Demo Company',
      code: 'DEMO',
      status: TenantStatus.ACTIVE,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      ...overrides,
    };
  }

  function createService() {
    const prisma: {
      tenant: {
        create: jest.Mock;
        findMany: jest.Mock;
        findUnique: jest.Mock;
        update: jest.Mock;
      };
      $transaction: jest.Mock;
    } = {
      tenant: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (fn: (client: typeof prisma) => Promise<unknown>) => fn(prisma),
    );
    const audit = {
      record: jest.fn().mockResolvedValue(undefined),
    };
    const service = new TenantsService(
      prisma as never,
      audit as unknown as AuditService,
    );
    return { service, prisma, audit };
  }

  it('creates a tenant and writes tenant.created audit without secrets', async () => {
    const { service, prisma, audit } = createService();
    const created = tenantRecord({
      id: otherTenantId,
      name: 'Acme',
      code: 'ACME',
    });
    prisma.tenant.create.mockResolvedValue(created);

    const result = await service.create(actor, { name: 'Acme', code: 'acme' });

    expect(prisma.tenant.create).toHaveBeenCalledWith({
      data: { name: 'Acme', code: 'ACME' },
    });
    expect(result).toMatchObject({ id: otherTenantId, code: 'ACME' });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tenant.created',
        resource: 'tenant',
        resourceId: otherTenantId,
        resourceTenantId: otherTenantId,
      }),
      prisma,
    );
  });

  it('rejects a duplicate tenant code', async () => {
    const { service, prisma } = createService();
    prisma.tenant.create.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.create(actor, { name: 'Demo', code: 'DEMO' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lists only the actor tenant', async () => {
    const { service, prisma } = createService();
    prisma.tenant.findMany.mockResolvedValue([tenantRecord()]);

    await service.list(actor);

    expect(prisma.tenant.findMany).toHaveBeenCalledWith({
      where: { id: actor.tenantId },
      orderBy: { code: 'asc' },
    });
  });

  it('returns 404 for another tenant id', async () => {
    const { service, prisma } = createService();

    await expect(service.getById(actor, otherTenantId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });
});
