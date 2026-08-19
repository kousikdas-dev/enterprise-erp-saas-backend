import { ConflictException, NotFoundException } from '@nestjs/common';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { SuppliersService } from './suppliers.service';

describe('SuppliersService', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };

  function row(overrides: Record<string, unknown> = {}) {
    return {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      tenantId: actor.tenantId,
      code: 'ACME',
      name: 'Acme Supplies',
      address: null,
      isActive: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      ...overrides,
    };
  }

  function createService() {
    const prisma = {
      supplier: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new SuppliersService(
      prisma as never,
      audit as unknown as IdentityAuditClient,
    );
    return { service, prisma, audit };
  }

  it('creates a supplier and writes supplier.created', async () => {
    const { service, prisma, audit } = createService();
    prisma.supplier.create.mockResolvedValue(row());
    await service.create(actor, { code: 'acme', name: 'Acme Supplies' });
    expect(prisma.supplier.create).toHaveBeenCalledWith({
      data: {
        tenantId: actor.tenantId,
        code: 'ACME',
        name: 'Acme Supplies',
        address: null,
      },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'supplier.created' }),
    );
  });

  it('rejects duplicate supplier codes', async () => {
    const { service, prisma } = createService();
    prisma.supplier.create.mockRejectedValue({ code: 'P2002' });
    await expect(
      service.create(actor, { code: 'ACME', name: 'Acme' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('scopes list and get by tenant', async () => {
    const { service, prisma } = createService();
    prisma.supplier.findMany.mockResolvedValue([row()]);
    prisma.supplier.findFirst.mockResolvedValue(row());
    await service.list(actor);
    await service.getById(actor, row().id);
    expect(prisma.supplier.findMany).toHaveBeenCalledWith({
      where: { tenantId: actor.tenantId },
      orderBy: { code: 'asc' },
    });
    expect(prisma.supplier.findFirst).toHaveBeenCalledWith({
      where: { id: row().id, tenantId: actor.tenantId },
    });
  });

  it('returns 404 for another tenant supplier', async () => {
    const { service, prisma } = createService();
    prisma.supplier.findFirst.mockResolvedValue(null);
    await expect(service.getById(actor, row().id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
