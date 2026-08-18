import { PermissionsService } from './permissions.service';

describe('PermissionsService', () => {
  it('lists the global catalog without tenant filtering', async () => {
    const prisma = {
      permission: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'p1',
            resource: 'users',
            action: 'read',
            description: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      },
    };
    const service = new PermissionsService(prisma as never);

    const result = await service.list();

    expect(prisma.permission.findMany).toHaveBeenCalled();
    expect(result.items[0]).toMatchObject({ key: 'users.read' });
  });
});
