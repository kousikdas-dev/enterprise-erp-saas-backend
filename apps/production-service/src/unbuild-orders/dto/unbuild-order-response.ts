import { Prisma, UnbuildOrderStatus } from '../../../generated/prisma-client';
import { quantityToString } from '../../common/decimal';

type UnbuildOrderItemRow = {
  id: string;
  tenantId: string;
  unbuildOrderId: string;
  componentProductId: string;
  componentProductSku: string;
  componentProductName: string;
  quantity: Prisma.Decimal;
  unitOfMeasureId: string;
  uomCode: string;
  uomName: string;
  sequence: number;
  stockMovementId: string | null;
};

type UnbuildOrderRow = {
  id: string;
  tenantId: string;
  orderNumber: string;
  productId: string;
  productSku: string;
  productName: string;
  bomId: string;
  bomVersion: number;
  quantity: Prisma.Decimal;
  unitOfMeasureId: string;
  uomCode: string;
  uomName: string;
  warehouseId: string;
  sourceProductionOrderId: string | null;
  sourceProductionOrderNumber: string | null;
  status: UnbuildOrderStatus;
  processingStartedAt: Date | null;
  unbuildDate: Date;
  notes: string | null;
  completedAt: Date | null;
  completedBy: string | null;
  finishedGoodsMovementId: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: UnbuildOrderItemRow[];
};

function toUnbuildOrderItemResponse(item: UnbuildOrderItemRow) {
  return {
    id: item.id,
    tenantId: item.tenantId,
    unbuildOrderId: item.unbuildOrderId,
    componentProductId: item.componentProductId,
    componentProductSku: item.componentProductSku,
    componentProductName: item.componentProductName,
    quantity: quantityToString(item.quantity),
    unitOfMeasureId: item.unitOfMeasureId,
    uomCode: item.uomCode,
    uomName: item.uomName,
    sequence: item.sequence,
    stockMovementId: item.stockMovementId,
  };
}

export function toUnbuildOrderResponse(row: UnbuildOrderRow) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    orderNumber: row.orderNumber,
    productId: row.productId,
    productSku: row.productSku,
    productName: row.productName,
    bomId: row.bomId,
    bomVersion: row.bomVersion,
    quantity: quantityToString(row.quantity),
    unitOfMeasureId: row.unitOfMeasureId,
    uomCode: row.uomCode,
    uomName: row.uomName,
    warehouseId: row.warehouseId,
    sourceProductionOrderId: row.sourceProductionOrderId,
    sourceProductionOrderNumber: row.sourceProductionOrderNumber,
    status: row.status,
    unbuildDate: row.unbuildDate,
    notes: row.notes,
    completedAt: row.completedAt,
    completedBy: row.completedBy,
    finishedGoodsMovementId: row.finishedGoodsMovementId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: row.items
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .map(toUnbuildOrderItemResponse),
  };
}
