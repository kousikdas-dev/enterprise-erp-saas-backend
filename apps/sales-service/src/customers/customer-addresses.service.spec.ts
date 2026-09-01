import { NotFoundException } from '@nestjs/common';
import { CustomerAddressesService } from './customer-addresses.service';

describe('CustomerAddressesService', () => {
  const actor = {
    userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    tenantId: '11111111-1111-4111-8111-111111111111',
  };
  const customerId = '22222222-2222-4222-8222-222222222222';
  const addressId = '33333333-3333-4333-8333-333333333333';

  const address = {
    id: addressId,
    tenantId: actor.tenantId,
    customerId,
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

  it('keeps one default when a default address changes type', async () => {
    const tx = {
      customerAddress: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({
          ...address,
          type: 'SHIPPING',
        }),
      },
    };
    const prisma = {
      customerAddress: {
        findFirst: jest.fn().mockResolvedValue(address),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new CustomerAddressesService(prisma as never, audit as never);

    await service.update(actor, customerId, addressId, { type: 'SHIPPING' });

    expect(tx.customerAddress.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: actor.tenantId,
        customerId,
        type: 'SHIPPING',
        isDefault: true,
        id: { not: addressId },
      },
      data: { isDefault: false },
    });
  });

  it('does not delete an address outside the actor tenant/customer scope', async () => {
    const prisma = {
      customerAddress: {
        findFirst: jest.fn().mockResolvedValue(null),
        delete: jest.fn(),
      },
    };
    const service = new CustomerAddressesService(
      prisma as never,
      { record: jest.fn() } as never,
    );

    await expect(
      service.remove(actor, customerId, addressId),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.customerAddress.delete).not.toHaveBeenCalled();
  });
});
