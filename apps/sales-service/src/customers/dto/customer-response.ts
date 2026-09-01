import { CustomerAddress } from '../../../generated/prisma-client';
import { toCustomerAddress } from './customer-address-response';

function toCustomer(row: {
  id: string;
  tenantId: string;
  code: string;
  name: string;

  // Basic Information
  company: string | null;
  email: string | null;
  phone: string | null;
  jobPosition: string | null;
  website: string | null;
  tags: string[];
  gstin: string | null;

  // Sales
  salespersonId: string | null;
  paymentTermId: string | null;
  paymentMethodId: string | null;
  fiscalPositionId: string | null;
  industryId: string | null;

  // Main Address
  street: string | null;
  street2: string | null;
  city: string | null;
  zip: string | null;
  state: string | null;
  country: string | null;

  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  addresses?: CustomerAddress[];
}) {
  const { addresses, ...customer } = row;

  return {
    ...customer,
    ...(addresses === undefined
      ? {}
      : { addresses: addresses.map(toCustomerAddress) }),
  };
}

export { toCustomer };
