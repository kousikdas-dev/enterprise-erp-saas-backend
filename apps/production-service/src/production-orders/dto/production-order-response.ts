import {
  Prisma,
  ProductionOrderPriority,
  ProductionOrderStatus,
} from '../../../generated/prisma-client';
import { quantityToString } from '../../common/decimal';

type ProductionOrderItemRow = {
  id: string;
  tenantId: string;
  productionOrderId: string;
  componentProductId: string;
  componentProductSku: string;
  componentProductName: string;
  quantity: Prisma.Decimal;
  unitOfMeasureId: string;
  uomCode: string;
  uomName: string;
  sequence: number;
  createdAt: Date;
  updatedAt: Date;
};

type ProductionOrderRow = {
  id: string;
  tenantId: string;
  orderNumber: string;
  productId: string;
  productSku: string;
  productName: string;
  bomId: string;
  bomVersion: number;
  routingId: string | null;
  routingVersion: number | null;
  plannedQuantity: Prisma.Decimal;
  outputUnitOfMeasureId: string;
  outputUomCode: string;
  outputUomName: string;
  orderDate: Date;
  plannedStartDate: Date | null;
  plannedEndDate: Date | null;
  warehouseId: string | null;
  priority: ProductionOrderPriority;
  status: ProductionOrderStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: ProductionOrderItemRow[];
};

function toProductionOrderItemResponse(item: ProductionOrderItemRow) {
  return {
    id: item.id,
    tenantId: item.tenantId,
    productionOrderId: item.productionOrderId,
    componentProductId: item.componentProductId,
    componentProductSku: item.componentProductSku,
    componentProductName: item.componentProductName,
    quantity: quantityToString(item.quantity),
    unitOfMeasureId: item.unitOfMeasureId,
    uomCode: item.uomCode,
    uomName: item.uomName,
    sequence: item.sequence,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export function toProductionOrderResponse(row: ProductionOrderRow) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    orderNumber: row.orderNumber,
    productId: row.productId,
    productSku: row.productSku,
    productName: row.productName,
    bomId: row.bomId,
    bomVersion: row.bomVersion,
    routingId: row.routingId,
    routingVersion: row.routingVersion,
    plannedQuantity: quantityToString(row.plannedQuantity),
    outputUnitOfMeasureId: row.outputUnitOfMeasureId,
    outputUomCode: row.outputUomCode,
    outputUomName: row.outputUomName,
    orderDate: row.orderDate,
    plannedStartDate: row.plannedStartDate,
    plannedEndDate: row.plannedEndDate,
    warehouseId: row.warehouseId,
    priority: row.priority,
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: row.items
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .map(toProductionOrderItemResponse),
  };
}
