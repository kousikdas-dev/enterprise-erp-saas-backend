import { ConflictException, NotFoundException } from '@nestjs/common';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { WarehousesService } from './warehouses.service';

describe('WarehousesService', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };

  function row(overrides: Record<string, unknown> = {}) {
    return {
      id: '22222222-aaaa-4aaa-8aaa-222222222222',
      tenantId: actor.tenantId,
      code: 'MAIN',
      name: 'Main',
      address: null,
      isActive: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      ...overrides,
    };
  }

  function createService() {
    const prisma = {
      warehouse: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new WarehousesService(
      prisma as never,
      audit as unknown as IdentityAuditClient,
    );
    return { service, prisma, audit };
  }

  it('creates a warehouse and writes warehouse.created', async () => {
    const { service, prisma, audit } = createService();
    prisma.warehouse.create.mockResolvedValue(row());
    await service.create(actor, { code: 'main', name: 'Main' });
    expect(prisma.warehouse.create).toHaveBeenCalledWith({
      data: {
        tenantId: actor.tenantId,
        code: 'MAIN',
        name: 'Main',
        address: null,
      },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'warehouse.created' }),
    );
  });

  it('rejects a duplicate warehouse code', async () => {
    const { service, prisma } = createService();
    prisma.warehouse.create.mockRejectedValue({ code: 'P2002' });
    await expect(
      service.create(actor, { code: 'MAIN', name: 'Main' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lists only the actor tenant', async () => {
    const { service, prisma } = createService();
    prisma.warehouse.findMany.mockResolvedValue([row()]);
    await service.list(actor);
    expect(prisma.warehouse.findMany).toHaveBeenCalledWith({
      where: { tenantId: actor.tenantId },
      orderBy: { code: 'asc' },
    });
  });

  it('gets a warehouse in the actor tenant', async () => {
    const { service, prisma } = createService();
    prisma.warehouse.findFirst.mockResolvedValue(row());
    await expect(service.getById(actor, row().id)).resolves.toMatchObject({
      code: 'MAIN',
    });
  });

  it('updates a warehouse and writes warehouse.updated', async () => {
    const { service, prisma, audit } = createService();
    prisma.warehouse.findFirst.mockResolvedValue(row());
    prisma.warehouse.update.mockResolvedValue(row({ name: 'North' }));
    await service.update(actor, row().id, { name: 'North' });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'warehouse.updated' }),
    );
  });

  it('returns 404 for another tenant warehouse', async () => {
    const { service, prisma } = createService();
    prisma.warehouse.findFirst.mockResolvedValue(null);
    await expect(service.getById(actor, row().id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
