import { NotFoundException } from '@nestjs/common';
import { SupplierAddressesService } from './supplier-addresses.service';

describe('SupplierAddressesService', () => {
  const actor = {
    userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    tenantId: '11111111-1111-4111-8111-111111111111',
  };
  const supplierId = '22222222-2222-4222-8222-222222222222';
  const addressId = '33333333-3333-4333-8333-333333333333';

  const address = {
    id: addressId,
    tenantId: actor.tenantId,
    supplierId,
    type: 'BILLING' as const,
    name: 'Acme Billing',
    addressLine1: '1 Main Street',
    addressLine2: null,
    city: 'Kolkata',
    state: null,
    postalCode: null,
    country: 'India',
    phone: null,
    isDefault: true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('unsets other defaults of the same type when creating a default address', async () => {
    const tx = {
      supplierAddress: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue(address),
      },
    };
    const prisma = {
      supplier: {
        findFirst: jest.fn().mockResolvedValue({ id: supplierId }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new SupplierAddressesService(
      prisma as never,
      audit as never,
    );

    await service.create(actor, supplierId, {
      type: 'BILLING',
      name: 'Acme Billing',
      addressLine1: '1 Main Street',
      city: 'Kolkata',
      country: 'India',
      isDefault: true,
    });

    expect(tx.supplierAddress.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: actor.tenantId,
        supplierId,
        type: 'BILLING',
        isDefault: true,
      },
      data: { isDefault: false },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'supplier.address.created' }),
    );
  });

  it('keeps one default when a default address changes type', async () => {
    const tx = {
      supplierAddress: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({
          ...address,
          type: 'DISPATCH',
        }),
      },
    };
    const prisma = {
      supplierAddress: {
        findFirst: jest.fn().mockResolvedValue(address),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new SupplierAddressesService(
      prisma as never,
      audit as never,
    );

    await service.update(actor, supplierId, addressId, { type: 'DISPATCH' });

    expect(tx.supplierAddress.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: actor.tenantId,
        supplierId,
        type: 'DISPATCH',
        isDefault: true,
        id: { not: addressId },
      },
      data: { isDefault: false },
    });
  });

  it('returns 404 when the parent supplier is outside the actor tenant', async () => {
    const prisma = {
      supplier: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new SupplierAddressesService(
      prisma as never,
      { record: jest.fn() } as never,
    );

    await expect(
      service.list(actor, supplierId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not delete an address outside the actor tenant/supplier scope', async () => {
    const prisma = {
      supplierAddress: {
        findFirst: jest.fn().mockResolvedValue(null),
        delete: jest.fn(),
      },
    };
    const service = new SupplierAddressesService(
      prisma as never,
      { record: jest.fn() } as never,
    );

    await expect(
      service.remove(actor, supplierId, addressId),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.supplierAddress.delete).not.toHaveBeenCalled();
  });
});
