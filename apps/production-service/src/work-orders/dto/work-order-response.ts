import { WorkOrderStatus } from '../../../generated/prisma-client';

type WorkOrderRow = {
  id: string;
  tenantId: string;
  workOrderNumber: string;
  productionOrderId: string;
  productionOrderNumber: string;
  productId: string;
  productSku: string;
  productName: string;
  operationId: string;
  operationCode: string;
  operationName: string;
  workCentreId: string;
  workCentreCode: string;
  workCentreName: string;
  sequence: number;
  plannedDurationMinutes: number;
  scheduledStartDate: Date | null;
  scheduledEndDate: Date | null;
  status: WorkOrderStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toWorkOrderResponse(row: WorkOrderRow) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    workOrderNumber: row.workOrderNumber,
    productionOrderId: row.productionOrderId,
    productionOrderNumber: row.productionOrderNumber,
    productId: row.productId,
    productSku: row.productSku,
    productName: row.productName,
    operationId: row.operationId,
    operationCode: row.operationCode,
    operationName: row.operationName,
    workCentreId: row.workCentreId,
    workCentreCode: row.workCentreCode,
    workCentreName: row.workCentreName,
    sequence: row.sequence,
    plannedDurationMinutes: row.plannedDurationMinutes,
    scheduledStartDate: row.scheduledStartDate,
    scheduledEndDate: row.scheduledEndDate,
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
