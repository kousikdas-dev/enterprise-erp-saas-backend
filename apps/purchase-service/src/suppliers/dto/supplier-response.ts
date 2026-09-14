import { SupplierAddress } from '../../../generated/prisma-client';
import { toSupplierAddress } from './supplier-address-response';

function toSupplier(row: {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  jobPosition: string | null;
  website: string | null;
  gstin: string | null;
  tags: string[];
  paymentTermId: string | null;
  fiscalPositionId: string | null;
  industryId: string | null;
  notes: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  addresses?: SupplierAddress[];
}) {
  const { addresses, ...supplier } = row;

  return {
    ...supplier,
    ...(addresses === undefined
      ? {}
      : { addresses: addresses.map(toSupplierAddress) }),
  };
}

export { toSupplier };
