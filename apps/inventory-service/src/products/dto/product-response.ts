import { Product } from '../../../generated/prisma-client';
import { moneyToString } from '../../common/decimal';

export interface ProductAttributeValueSummary {
  id: string;
  attributeId: string;
  attributeName: string;
  value: string;
}

type ProductRow = Product & {
  attributeValues?: Array<{
    attributeValue: { id: string; attributeId: string; value: string; attribute: { name: string } };
  }>;
};

export function toProductResponse(row: ProductRow) {
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
    templateProductId: row.templateProductId,
    attributeValues: (row.attributeValues ?? []).map(
      (pav): ProductAttributeValueSummary => ({
        id: pav.attributeValue.id,
        attributeId: pav.attributeValue.attributeId,
        attributeName: pav.attributeValue.attribute.name,
        value: pav.attributeValue.value,
      }),
    ),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
