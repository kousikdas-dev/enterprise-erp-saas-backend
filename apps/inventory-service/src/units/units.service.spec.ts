import { ConflictException, NotFoundException } from '@nestjs/common';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { UnitsService } from './units.service';

describe('UnitsService', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };

  function row(overrides: Record<string, unknown> = {}) {
    return {
      id: '11111111-aaaa-4aaa-8aaa-111111111111',
      tenantId: actor.tenantId,
      code: 'PCS',
      name: 'Pieces',
      isActive: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      ...overrides,
    };
  }

  function createService() {
    const prisma = {
      unitOfMeasure: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new UnitsService(
      prisma as never,
      audit as unknown as IdentityAuditClient,
    );
    return { service, prisma, audit };
  }

  it('creates a unit and writes unit.created', async () => {
    const { service, prisma, audit } = createService();
    prisma.unitOfMeasure.create.mockResolvedValue(row());

    await service.create(actor, { code: 'pcs', name: 'Pieces' });

    expect(prisma.unitOfMeasure.create).toHaveBeenCalledWith({
      data: { tenantId: actor.tenantId, code: 'PCS', name: 'Pieces' },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'unit.created' }),
    );
  });

  it('rejects a duplicate unit code', async () => {
    const { service, prisma } = createService();
    prisma.unitOfMeasure.create.mockRejectedValue({ code: 'P2002' });
    await expect(
      service.create(actor, { code: 'PCS', name: 'Pieces' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lists only the actor tenant', async () => {
    const { service, prisma } = createService();
    prisma.unitOfMeasure.findMany.mockResolvedValue([row()]);
    await service.list(actor);
    expect(prisma.unitOfMeasure.findMany).toHaveBeenCalledWith({
      where: { tenantId: actor.tenantId },
      orderBy: { code: 'asc' },
    });
  });

  it('gets a unit in the actor tenant', async () => {
    const { service, prisma } = createService();
    prisma.unitOfMeasure.findFirst.mockResolvedValue(row());
    await expect(service.getById(actor, row().id)).resolves.toMatchObject({
      code: 'PCS',
    });
  });

  it('updates a unit and writes unit.updated', async () => {
    const { service, prisma, audit } = createService();
    prisma.unitOfMeasure.findFirst.mockResolvedValue(row());
    prisma.unitOfMeasure.update.mockResolvedValue(row({ name: 'Each' }));
    await service.update(actor, row().id, { name: 'Each' });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'unit.updated' }),
    );
  });

  it('returns 404 for another tenant unit', async () => {
    const { service, prisma } = createService();
    prisma.unitOfMeasure.findFirst.mockResolvedValue(null);
    await expect(service.getById(actor, row().id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
