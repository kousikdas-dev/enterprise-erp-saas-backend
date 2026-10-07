import { DeliveryMethod } from '../../../generated/prisma-client';
import { moneyToString } from '../../common/decimal';

export function toDeliveryMethodResponse(row: DeliveryMethod) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    code: row.code,
    name: row.name,
    price: moneyToString(row.price),
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
