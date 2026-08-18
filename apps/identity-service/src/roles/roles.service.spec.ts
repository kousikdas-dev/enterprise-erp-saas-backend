import { ConflictException, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { RolesService } from './roles.service';

describe('RolesService', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const otherTenantId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const permission = {
    id: '44444444-4444-4444-8444-444444444444',
    resource: 'users',
    action: 'read',
    description: 'Read users',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  function roleRecord(
    overrides: Record<string, unknown> = {},
    permissions: (typeof permission)[] = [],
  ) {
    return {
      id: '33333333-3333-4333-8333-333333333333',
      tenantId: actor.tenantId,
      name: 'MANAGER',
      description: 'ops',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      rolePermissions: permissions.map((item) => ({ permission: item })),
      ...overrides,
    };
  }

  function createService() {
    const prisma = {
      role: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      permission: { findUnique: jest.fn() },
      rolePermission: {
        create: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (fn: (client: typeof prisma) => Promise<unknown>) => fn(prisma),
    );
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new RolesService(
      prisma as never,
      audit as unknown as AuditService,
    );
    return { service, prisma, audit };
  }

  function firstArg<T>(mock: jest.Mock): T {
    const [first] = mock.mock.calls as unknown as [T][];
    return first[0];
  }

  it('creates a role in the actor tenant and writes role.created', async () => {
    const { service, prisma, audit } = createService();
    prisma.role.create.mockResolvedValue(roleRecord());

    const result = await service.create(actor, {
      name: 'MANAGER',
      description: 'ops',
    });

    expect(
      firstArg<{ data: { tenantId: string; name: string } }>(prisma.role.create)
        .data,
    ).toEqual({
      tenantId: actor.tenantId,
      name: 'MANAGER',
      description: 'ops',
    });
    expect(result.permissions).toEqual([]);
    expect(firstArg<{ action: string }>(audit.record).action).toBe(
      'role.created',
    );
    expect(JSON.stringify(audit.record.mock.calls)).not.toMatch(
      /password|accessToken|refreshToken/i,
    );
  });

  it('rejects a duplicate role name', async () => {
    const { service, prisma } = createService();
    prisma.role.create.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.create(actor, { name: 'SUPER_ADMIN' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lists only actor-tenant roles', async () => {
    const { service, prisma } = createService();
    prisma.role.findMany.mockResolvedValue([roleRecord()]);

    await service.list(actor);

    expect(prisma.role.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: actor.tenantId },
      }),
    );
  });

  it('returns 404 for a role in another tenant', async () => {
    const { service, prisma } = createService();
    prisma.role.findFirst.mockResolvedValue(null);

    await expect(
      service.getById(actor, '33333333-3333-4333-8333-333333333333'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.role.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: '33333333-3333-4333-8333-333333333333',
          tenantId: actor.tenantId,
        },
      }),
    );
    const lookup = firstArg<{ where: { tenantId: string } }>(
      prisma.role.findFirst,
    );
    expect(lookup.where.tenantId).toBe(actor.tenantId);
    expect(lookup.where.tenantId).not.toBe(otherTenantId);
  });

  it('assigns a catalog permission and rejects duplicates', async () => {
    const { service, prisma, audit } = createService();
    prisma.role.findFirst.mockResolvedValue(roleRecord());
    prisma.permission.findUnique.mockResolvedValue(permission);
    prisma.rolePermission.create.mockResolvedValue({});
    prisma.role.findUniqueOrThrow.mockResolvedValue(
      roleRecord({}, [permission]),
    );

    const assigned = await service.assignPermission(actor, roleRecord().id, {
      permissionId: permission.id,
    });
    expect(assigned.permissions[0].key).toBe('users.read');
    expect(firstArg<{ action: string }>(audit.record).action).toBe(
      'role.permission_assigned',
    );

    prisma.rolePermission.create.mockRejectedValue({ code: 'P2002' });
    await expect(
      service.assignPermission(actor, roleRecord().id, {
        permissionId: permission.id,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not assign permissions to a cross-tenant role', async () => {
    const { service, prisma } = createService();
    prisma.role.findFirst.mockResolvedValue(null);

    await expect(
      service.assignPermission(actor, '33333333-3333-4333-8333-333333333333', {
        permissionId: permission.id,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.rolePermission.create).not.toHaveBeenCalled();
  });

  it('returns 404 when removing a missing assignment', async () => {
    const { service, prisma } = createService();
    prisma.role.findFirst.mockResolvedValue(roleRecord());
    prisma.rolePermission.findUnique.mockResolvedValue(null);

    await expect(
      service.removePermission(actor, roleRecord().id, permission.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
