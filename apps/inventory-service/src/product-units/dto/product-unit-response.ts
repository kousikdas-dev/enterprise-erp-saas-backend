import { ProductUnit } from '../../../generated/prisma-client';
import { moneyToString, quantityToString } from '../../common/decimal';

export function toProductUnitResponse(row: ProductUnit) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    productId: row.productId,
    unitOfMeasureId: row.unitOfMeasureId,
    conversionFactor: quantityToString(row.conversionFactor),
    sellingPrice: moneyToString(row.sellingPrice),
    costPrice: moneyToString(row.costPrice),
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
