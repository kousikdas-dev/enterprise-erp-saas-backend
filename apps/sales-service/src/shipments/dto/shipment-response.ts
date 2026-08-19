import { Prisma, ShipmentStatus } from '../../../generated/prisma-client';
import { quantityToString } from '../../common/decimal';

type ShipmentWithItems = {
  id: string;
  tenantId: string;
  salesOrderId: string;
  warehouseId: string;
  status: ShipmentStatus;
  shippedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    tenantId: string;
    shipmentId: string;
    salesOrderItemId: string;
    productId: string;
    productSku: string;
    productName: string;
    quantity: Prisma.Decimal;
    createdAt: Date;
    updatedAt: Date;
  }>;
};

export function toShipmentResponse(row: ShipmentWithItems) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    salesOrderId: row.salesOrderId,
    warehouseId: row.warehouseId,
    status: row.status,
    shippedAt: row.shippedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: row.items.map((item) => ({
      id: item.id,
      tenantId: item.tenantId,
      shipmentId: item.shipmentId,
      salesOrderItemId: item.salesOrderItemId,
      productId: item.productId,
      productSku: item.productSku,
      productName: item.productName,
      quantity: quantityToString(item.quantity),
      warehouseId: row.warehouseId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
  };
}
