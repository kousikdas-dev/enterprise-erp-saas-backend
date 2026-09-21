import { AccountMappingPurpose } from '../../../generated/prisma-client';

interface AccountMappingRow {
  id: string;
  tenantId: string;
  purpose: AccountMappingPurpose;
  externalRefId: string;
  accountId: string;
  createdAt: Date;
  updatedAt: Date;
  account?: { id: string; code: string; name: string } | null;
}

function toAccountMapping(row: AccountMappingRow) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    purpose: row.purpose,
    externalRefId: row.externalRefId,
    accountId: row.accountId,
    account: row.account ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export { toAccountMapping };
