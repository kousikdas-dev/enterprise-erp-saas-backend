import { UnspscCategory } from '../../../generated/prisma-client';

export function toUnspscCategoryResponse(row: UnspscCategory) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    code: row.code,
    name: row.name,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
