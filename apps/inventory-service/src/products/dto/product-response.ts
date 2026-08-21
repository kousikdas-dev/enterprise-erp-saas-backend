import { Product } from '../../../generated/prisma-client';
import { moneyToString } from '../../common/decimal';

export function toProductResponse(row: Product) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    sku: row.sku,
    name: row.name,
    description: row.description,
    categoryId: row.categoryId,
    unitOfMeasureId: row.unitOfMeasureId,
    sellingPrice: moneyToString(row.sellingPrice),
    costPrice: moneyToString(row.costPrice),
    isActive: row.isActive,
    productType: row.productType,
    trackInventory: row.trackInventory,
    barcode: row.barcode,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
