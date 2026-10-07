import { Pricelist, PricelistItem } from '../../../generated/prisma-client';
import { moneyToString } from '../../common/decimal';

export function toPricelistItemResponse(row: PricelistItem) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    pricelistId: row.pricelistId,
    applyOn: row.applyOn,
    categoryId: row.categoryId,
    productId: row.productId,
    computeMethod: row.computeMethod,
    fixedPrice: row.fixedPrice ? moneyToString(row.fixedPrice) : null,
    discountPercent: row.discountPercent
      ? moneyToString(row.discountPercent)
      : null,
    minQuantity: moneyToString(row.minQuantity),
    validFrom: row.validFrom,
    validTo: row.validTo,
    sequence: row.sequence,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toPricelistResponse(
  row: Pricelist & {
    items?: PricelistItem[];
    _count?: { items: number };
  },
) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    itemCount: row.items ? row.items.length : (row._count?.items ?? 0),
    items: row.items ? row.items.map(toPricelistItemResponse) : undefined,
  };
}
