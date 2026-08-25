import { CustomerAddress } from '../../../generated/prisma-client';

export function toCustomerAddress(row: CustomerAddress) {
  return {
    id: row.id,
    customerId: row.customerId,
    type: row.type,
    name: row.name,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    state: row.state,
    postalCode: row.postalCode,
    country: row.country,
    phone: row.phone,
    isDefault: row.isDefault,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}