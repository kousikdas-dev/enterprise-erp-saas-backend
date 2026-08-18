import { AuditService } from './audit.service';

function firstArg<T>(mock: jest.Mock): T {
  const [first] = mock.mock.calls as unknown as [T][];
  return first[0];
}

describe('AuditService', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };

  it('stores actor userId when the resource belongs to the same tenant', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = {
      auditLog: { create },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: actor.userId }),
      },
    };
    const service = new AuditService(prisma as never);

    await service.record({
      actor,
      resourceTenantId: actor.tenantId,
      action: 'user.created',
      resource: 'user',
      resourceId: 'user-2',
      metadata: { password: 'nope', email: 'a@b.c' },
    });

    const createArg = firstArg<{
      data: {
        metadata: Record<string, unknown>;
        tenantId: string;
        userId: string;
        action: string;
      };
    }>(create);
    expect(createArg.data.metadata).toMatchObject({
      email: 'a@b.c',
      actorUserId: actor.userId,
    });
    expect(createArg.data.metadata).not.toHaveProperty('password');
    expect(createArg.data).toMatchObject({
      tenantId: actor.tenantId,
      userId: actor.userId,
      action: 'user.created',
    });
  });

  it('omits userId when the resource tenant differs from the actor', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = {
      auditLog: { create },
      user: { findFirst: jest.fn() },
    };
    const service = new AuditService(prisma as never);
    const createdTenantId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    await service.record({
      actor,
      resourceTenantId: createdTenantId,
      action: 'tenant.created',
      resource: 'tenant',
      resourceId: createdTenantId,
      metadata: { code: 'ACME' },
    });

    const createArg = firstArg<{
      data: { tenantId: string; userId: string | null; action: string };
    }>(create);
    expect(createArg.data).toMatchObject({
      tenantId: createdTenantId,
      userId: null,
      action: 'tenant.created',
    });
  });
});
