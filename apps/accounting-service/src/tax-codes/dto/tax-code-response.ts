import { Prisma, TaxComponentType } from '../../../generated/prisma-client';

interface TaxComponentRow {
  id: string;
  tenantId: string;
  taxCodeId: string;
  sequence: number;
  type: TaxComponentType;
  name: string | null;
  rate: Prisma.Decimal;
  accountId: string | null;
  createdAt: Date;
  updatedAt: Date;
  account?: { id: string; code: string; name: string } | null;
}

interface TaxCodeRow {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  components: TaxComponentRow[];
}

function toTaxComponent(row: TaxComponentRow) {
  const { account, ...rest } = row;
  return {
    ...rest,
    rate: rest.rate.toFixed(4),
    account: account ?? null,
  };
}

function toTaxCode(row: TaxCodeRow) {
  return {
    ...row,
    components: row.components.map(toTaxComponent),
  };
}

export { toTaxCode };
