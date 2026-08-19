import {
  GoodsReceiptStatus,
  Prisma,
  PurchaseOrderStatus,
} from '../../../generated/prisma-client';
import { quantityToString } from '../../common/decimal';

type ReceiptWithItems = {
  id: string;
  tenantId: string;
  purchaseOrderId: string;
  warehouseId: string;
  status: GoodsReceiptStatus;
  receivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    tenantId: string;
    goodsReceiptId: string;
    purchaseOrderItemId: string;
    quantity: Prisma.Decimal;
    createdAt: Date;
    updatedAt: Date;
  }>;
};

export function toGoodsReceiptResponse(row: ReceiptWithItems) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    purchaseOrderId: row.purchaseOrderId,
    warehouseId: row.warehouseId,
    status: row.status,
    receivedAt: row.receivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: row.items.map((item) => ({
      id: item.id,
      tenantId: item.tenantId,
      goodsReceiptId: item.goodsReceiptId,
      purchaseOrderItemId: item.purchaseOrderItemId,
      quantity: quantityToString(item.quantity),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
  };
}

export { PurchaseOrderStatus, GoodsReceiptStatus };
