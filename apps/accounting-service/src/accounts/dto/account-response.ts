import { AccountType } from '../../../generated/prisma-client';

interface AccountRow {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  type: AccountType;
  parentId: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  parent?: { id: string; code: string; name: string } | null;
}

function toAccount(row: AccountRow) {
  const { parent, ...rest } = row;
  return {
    ...rest,
    parent: parent ?? null,
  };
}

export { toAccount };
