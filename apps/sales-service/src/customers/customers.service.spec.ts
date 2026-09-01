import { ConflictException, NotFoundException } from '@nestjs/common';
import { CustomersService } from './customers.service';

describe('CustomersService', () => {
  const actor = {
    userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    tenantId: '11111111-1111-4111-8111-111111111111',
  };

  it('creates customer with uppercased code and audits', async () => {
    const row = {
      id: 'c1',
      tenantId: actor.tenantId,
      code: 'ACME',
      name: 'Acme',
      company: null,
      email: null,
      phone: null,
      jobPosition: null,
      website: null,
      tags: [],
      gstin: null,
      salespersonId: null,
      paymentTermId: null,
      paymentMethodId: null,
      fiscalPositionId: null,
      industryId: null,
      street: null,
      street2: null,
      city: null,
      zip: null,
      state: null,
      country: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const prisma = {
      customer: { create: jest.fn().mockResolvedValue(row) },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new CustomersService(prisma as never, audit as never);
    const result = await service.create(actor, { code: 'acme', name: 'Acme' });
    expect(prisma.customer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ code: 'ACME', tenantId: actor.tenantId }),
      }),
    );
    expect(result.code).toBe('ACME');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'customer.created' }),
    );
  });

  it('maps unique violation to ConflictException', async () => {
    const prisma = {
      customer: {
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
      },
    };
    const service = new CustomersService(
      prisma as never,
      { record: jest.fn() } as never,
    );
    await expect(
      service.create(actor, { code: 'ACME', name: 'Acme' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('scopes require to tenant', async () => {
    const prisma = {
      customer: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new CustomersService(
      prisma as never,
      { record: jest.fn() } as never,
    );
    await expect(service.getById(actor, 'c1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.customer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1', tenantId: actor.tenantId },
        include: expect.objectContaining({ addresses: expect.any(Object) }),
      }),
    );
  });
});
