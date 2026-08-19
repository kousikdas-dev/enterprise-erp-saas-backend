import { Prisma, PurchaseOrderStatus } from '../../../generated/prisma-client';
import { moneyToString, quantityToString } from '../../common/decimal';

type OrderWithItems = {
  id: string;
  tenantId: string;
  supplierId: string;
  status: PurchaseOrderStatus;
  notes: string | null;
  orderDate: Date;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    tenantId: string;
    purchaseOrderId: string;
    productId: string;
    quantity: Prisma.Decimal;
    unitCost: Prisma.Decimal;
    receivedQuantity: Prisma.Decimal;
    createdAt: Date;
    updatedAt: Date;
  }>;
};

export function toPurchaseOrderResponse(row: OrderWithItems) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    supplierId: row.supplierId,
    status: row.status,
    notes: row.notes,
    orderDate: row.orderDate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: row.items.map((item) => ({
      id: item.id,
      tenantId: item.tenantId,
      purchaseOrderId: item.purchaseOrderId,
      productId: item.productId,
      quantity: quantityToString(item.quantity),
      unitCost: moneyToString(item.unitCost),
      receivedQuantity: quantityToString(item.receivedQuantity),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
  };
}
