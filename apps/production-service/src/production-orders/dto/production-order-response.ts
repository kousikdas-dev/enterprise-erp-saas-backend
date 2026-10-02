import {
  Prisma,
  ProductionOrderPriority,
  ProductionOrderStatus,
} from '../../../generated/prisma-client';
import { quantityToString } from '../../common/decimal';

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
};

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
  };
}
