import { Attribute, AttributeValue } from '../../../generated/prisma-client';
import { moneyToString } from '../../common/decimal';

export function toAttributeValueResponse(row: AttributeValue) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    attributeId: row.attributeId,
    value: row.value,
    isCustom: row.isCustom,
    extraPrice: moneyToString(row.extraPrice),
    sequence: row.sequence,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toAttributeResponse(
  row: Attribute & { values?: AttributeValue[] },
) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    displayType: row.displayType,
    variantCreation: row.variantCreation,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    values: row.values ? row.values.map(toAttributeValueResponse) : undefined,
  };
}
