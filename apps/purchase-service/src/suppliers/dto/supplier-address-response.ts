import { SupplierAddress } from '../../../generated/prisma-client';

export function toSupplierAddress(row: SupplierAddress) {
  return {
    id: row.id,
    supplierId: row.supplierId,
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
