import { ConflictException, NotFoundException } from '@nestjs/common';
import { UserStatus } from '../../generated/prisma-client';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';
import { UsersService } from './users.service';

function firstArg<T>(mock: jest.Mock): T {
  const [first] = mock.mock.calls as unknown as [T][];
  return first[0];
}

describe('UsersService', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const otherTenantId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  function userRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: '33333333-3333-4333-8333-333333333333',
      tenantId: actor.tenantId,
      email: 'ada@demo.local',
      passwordHash: 'hashed-secret',
      firstName: 'Ada',
      lastName: 'Lovelace',
      status: UserStatus.ACTIVE,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      ...overrides,
    };
  }

  function createService() {
    const prisma: {
      user: {
        create: jest.Mock;
        findMany: jest.Mock;
        findFirst: jest.Mock;
        update: jest.Mock;
      };
      $transaction: jest.Mock;
    } = {
      user: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (fn: (client: typeof prisma) => Promise<unknown>) => fn(prisma),
    );
    const passwords = {
      hash: jest.fn().mockResolvedValue('hashed-secret'),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new UsersService(
      prisma as never,
      passwords as unknown as PasswordService,
      audit as unknown as AuditService,
    );
    return { service, prisma, passwords, audit };
  }

  it('creates a user with a hashed password and omits the hash from the response', async () => {
    const { service, prisma, passwords, audit } = createService();
    prisma.user.create.mockResolvedValue(userRecord());

    const result = await service.create(actor, {
      email: 'Ada@Demo.local',
      password: 'plaintext-password',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });

    expect(passwords.hash).toHaveBeenCalledWith('plaintext-password');
    const createArg = firstArg<{ data: Record<string, unknown> }>(
      prisma.user.create,
    );
    expect(createArg.data).toMatchObject({
      tenantId: actor.tenantId,
      email: 'ada@demo.local',
      passwordHash: 'hashed-secret',
    });
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('password');
    expect(result.email).toBe('ada@demo.local');
    const auditArg = firstArg<{
      action: string;
      metadata: Record<string, unknown>;
    }>(audit.record);
    expect(auditArg.action).toBe('user.created');
    expect(auditArg.metadata).not.toHaveProperty('password');
    expect(auditArg.metadata).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(auditArg.metadata)).not.toMatch(
      /plaintext-password|hashed-secret/,
    );
  });

  it('rejects a duplicate email within the tenant', async () => {
    const { service, prisma } = createService();
    prisma.user.create.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.create(actor, {
        email: 'ada@demo.local',
        password: 'password12',
        firstName: 'Ada',
        lastName: 'Lovelace',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('scopes user lookup to the actor tenant', async () => {
    const { service, prisma } = createService();
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.getById(actor, '33333333-3333-4333-8333-333333333333'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: '33333333-3333-4333-8333-333333333333',
        tenantId: actor.tenantId,
      },
    });
    const lookupArg = firstArg<{ where: { tenantId: string } }>(
      prisma.user.findFirst,
    );
    expect(lookupArg.where.tenantId).not.toBe(otherTenantId);
  });

  it('lists only users in the actor tenant', async () => {
    const { service, prisma } = createService();
    prisma.user.findMany.mockResolvedValue([userRecord()]);

    const result = await service.list(actor);

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { tenantId: actor.tenantId },
      orderBy: { email: 'asc' },
    });
    expect(result.items[0]).not.toHaveProperty('passwordHash');
  });
});
