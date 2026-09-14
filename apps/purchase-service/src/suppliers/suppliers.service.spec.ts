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
      company: null,
      email: null,
      phone: null,
      jobPosition: null,
      website: null,
      gstin: null,
      tags: [],
      paymentTermId: null,
      fiscalPositionId: null,
      industryId: null,
      notes: null,
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
        company: null,
        email: null,
        phone: null,
        jobPosition: null,
        website: null,
        tags: [],
        gstin: null,
        paymentTermId: null,
        fiscalPositionId: null,
        industryId: null,
        notes: null,
        address: null,
      },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'supplier.created' }),
    );
  });

  it('normalizes email to lowercase and gstin to uppercase on create', async () => {
    const { service, prisma } = createService();
    prisma.supplier.create.mockResolvedValue(row());
    await service.create(actor, {
      code: 'acme',
      name: 'Acme Supplies',
      email: 'Contact@ACME.example',
      gstin: '22aaaaa0000a1z5',
    });
    expect(prisma.supplier.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'contact@acme.example',
          gstin: '22AAAAA0000A1Z5',
        }),
      }),
    );
  });

  it('does not require gstin to be supplied', async () => {
    const { service, prisma } = createService();
    prisma.supplier.create.mockResolvedValue(row());
    await expect(
      service.create(actor, { code: 'acme', name: 'Acme Supplies' }),
    ).resolves.toEqual(expect.objectContaining({ code: 'ACME' }));
    expect(prisma.supplier.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ gstin: null }) }),
    );
  });

  it('rejects duplicate supplier codes', async () => {
    const { service, prisma } = createService();
    prisma.supplier.create.mockRejectedValue({ code: 'P2002' });
    await expect(
      service.create(actor, { code: 'ACME', name: 'Acme' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('scopes list and get by tenant and eager-loads addresses', async () => {
    const { service, prisma } = createService();
    prisma.supplier.findMany.mockResolvedValue([row()]);
    prisma.supplier.findFirst.mockResolvedValue(row());
    await service.list(actor);
    await service.getById(actor, row().id);
    expect(prisma.supplier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: actor.tenantId },
        orderBy: { code: 'asc' },
        include: expect.objectContaining({ addresses: expect.any(Object) }),
      }),
    );
    expect(prisma.supplier.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: row().id, tenantId: actor.tenantId },
        include: expect.objectContaining({ addresses: expect.any(Object) }),
      }),
    );
  });

  it('returns 404 for another tenant supplier', async () => {
    const { service, prisma } = createService();
    prisma.supplier.findFirst.mockResolvedValue(null);
    await expect(service.getById(actor, row().id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('normalizes fields and writes supplier.updated on update', async () => {
    const { service, prisma, audit } = createService();
    prisma.supplier.findFirst.mockResolvedValue(row());
    prisma.supplier.update.mockResolvedValue(
      row({ email: 'buyer@acme.example', gstin: '22AAAAA0000A1Z5' }),
    );
    await service.update(actor, row().id, {
      email: 'Buyer@ACME.example',
      gstin: '22aaaaa0000a1z5',
    });
    expect(prisma.supplier.update).toHaveBeenCalledWith({
      where: { id: row().id },
      data: {
        email: 'buyer@acme.example',
        gstin: '22AAAAA0000A1Z5',
      },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'supplier.updated' }),
    );
  });

  it('rejects update with no fields', async () => {
    const { service, prisma } = createService();
    prisma.supplier.findFirst.mockResolvedValue(row());
    await expect(service.update(actor, row().id, {})).rejects.toThrow(
      'No fields to update',
    );
  });

  it('maps unique violation to ConflictException on update', async () => {
    const { service, prisma } = createService();
    prisma.supplier.findFirst.mockResolvedValue(row());
    prisma.supplier.update.mockRejectedValue({ code: 'P2002' });
    await expect(
      service.update(actor, row().id, { code: 'DUP' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
