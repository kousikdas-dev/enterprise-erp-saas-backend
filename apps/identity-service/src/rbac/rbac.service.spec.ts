import { RbacService } from './rbac.service';

describe('RbacService', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const tenantA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const tenantB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  it('returns permission keys only for the JWT tenant', async () => {
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: userId, tenantId: tenantA }),
      },
      userRole: {
        findMany: jest.fn().mockResolvedValue([
          {
            role: {
              rolePermissions: [
                { permission: { resource: 'rbac', action: 'test' } },
              ],
            },
          },
        ]),
      },
    };
    const service = new RbacService(prisma as never);

    await expect(service.listPermissionKeys(userId, tenantA)).resolves.toEqual([
      'rbac.test',
    ]);
    expect(prisma.userRole.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId, tenantId: tenantA },
      }),
    );
  });

  it('returns no permissions when the user belongs to a different tenant', async () => {
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: userId, tenantId: tenantA }),
      },
      userRole: { findMany: jest.fn() },
    };
    const service = new RbacService(prisma as never);

    await expect(service.listPermissionKeys(userId, tenantB)).resolves.toEqual(
      [],
    );
    expect(prisma.userRole.findMany).not.toHaveBeenCalled();
  });

  it('returns no permissions when the user has no matching roles', async () => {
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: userId, tenantId: tenantA }),
      },
      userRole: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new RbacService(prisma as never);

    await expect(service.listPermissionKeys(userId, tenantA)).resolves.toEqual(
      [],
    );
  });
});
