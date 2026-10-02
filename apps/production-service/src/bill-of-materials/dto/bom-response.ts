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
  createdAt: Date;
  updatedAt: Date;
  items: BomItemRow[];
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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: row.items
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .map(toBomItemResponse),
  };
}
