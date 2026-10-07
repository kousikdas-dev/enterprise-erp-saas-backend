import { BomStatus, Prisma } from '../../../generated/prisma-client';
import { percentToString, quantityToString } from '../../common/decimal';

type BomItemRow = {
  id: string;
  tenantId: string;
  bomId: string;
  componentProductId: string;
  componentProductSku: string;
  componentProductName: string;
  quantity: Prisma.Decimal;
  unitOfMeasureId: string;
  uomCode: string;
  uomName: string;
  scrapPercentage: Prisma.Decimal | null;
  sequence: number;
  createdAt: Date;
  updatedAt: Date;
};

type BomOperationRow = {
  id: string;
  tenantId: string;
  bomId: string;
  operationId: string;
  operationCode: string;
  operationName: string;
  sequence: number;
  createdAt: Date;
  updatedAt: Date;
};

type BomWithItems = {
  id: string;
  tenantId: string;
  parentProductId: string;
  parentProductSku: string;
  parentProductName: string;
  bomQuantity: Prisma.Decimal;
  outputUnitOfMeasureId: string;
  outputUomCode: string;
  outputUomName: string;
  version: number;
  status: BomStatus;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  notes: string | null;
  productVariantId: string | null;
  productVariantSku: string | null;
  productVariantName: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: BomItemRow[];
  operations: BomOperationRow[];
};

function toBomItemResponse(item: BomItemRow) {
  return {
    id: item.id,
    tenantId: item.tenantId,
    bomId: item.bomId,
    componentProductId: item.componentProductId,
    componentProductSku: item.componentProductSku,
    componentProductName: item.componentProductName,
    quantity: quantityToString(item.quantity),
    unitOfMeasureId: item.unitOfMeasureId,
    uomCode: item.uomCode,
    uomName: item.uomName,
    scrapPercentage: item.scrapPercentage
      ? percentToString(item.scrapPercentage)
      : null,
    sequence: item.sequence,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function toBomOperationResponse(operation: BomOperationRow) {
  return {
    id: operation.id,
    tenantId: operation.tenantId,
    bomId: operation.bomId,
    operationId: operation.operationId,
    operationCode: operation.operationCode,
    operationName: operation.operationName,
    sequence: operation.sequence,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
  };
}

export function toBomResponse(row: BomWithItems) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    parentProductId: row.parentProductId,
    parentProductSku: row.parentProductSku,
    parentProductName: row.parentProductName,
    bomQuantity: quantityToString(row.bomQuantity),
    outputUnitOfMeasureId: row.outputUnitOfMeasureId,
    outputUomCode: row.outputUomCode,
    outputUomName: row.outputUomName,
    version: row.version,
    status: row.status,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    notes: row.notes,
    productVariantId: row.productVariantId,
    productVariantSku: row.productVariantSku,
    productVariantName: row.productVariantName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: row.items
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .map(toBomItemResponse),
    operations: row.operations
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .map(toBomOperationResponse),
  };
}
