import {
  GoodsReceiptPostingStatus,
  GoodsReceiptStatus,
  Prisma,
  PurchaseOrderStatus,
} from '../../../generated/prisma-client';
import { moneyToString, quantityToString } from '../../common/decimal';

type ReceiptWithItems = {
  id: string;
  tenantId: string;
  purchaseOrderId: string;
  warehouseId: string;
  status: GoodsReceiptStatus;
  receivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  accountingPostingStatus: GoodsReceiptPostingStatus;
  journalEntryId: string | null;
  items: Array<{
    id: string;
    tenantId: string;
    goodsReceiptId: string;
    purchaseOrderItemId: string;
    quantity: Prisma.Decimal;
    productId: string;
    productSku: string;
    productName: string;
    unitOfMeasureId: string | null;
    uomCode: string | null;
    uomName: string | null;
    conversionFactor: Prisma.Decimal | null;
    baseQuantity: Prisma.Decimal | null;
    unitCost: Prisma.Decimal | null;
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
    // Phase 3.1 (GRNI Accounting) — Purchase-side cache of accounting-service's
    // own posting state, mirroring PurchaseInvoice's response shape.
    accountingPostingStatus: row.accountingPostingStatus,
    journalEntryId: row.journalEntryId,
    items: row.items.map((item) => ({
      id: item.id,
      tenantId: item.tenantId,
      goodsReceiptId: item.goodsReceiptId,
      purchaseOrderItemId: item.purchaseOrderItemId,
      quantity: quantityToString(item.quantity),
      productId: item.productId,
      productSku: item.productSku,
      productName: item.productName,
      unitOfMeasureId: item.unitOfMeasureId,
      uomCode: item.uomCode,
      uomName: item.uomName,
      conversionFactor: item.conversionFactor
        ? quantityToString(item.conversionFactor)
        : null,
      baseQuantity: item.baseQuantity
        ? quantityToString(item.baseQuantity)
        : null,
      unitCost: item.unitCost ? moneyToString(item.unitCost) : null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
  };
}

export { PurchaseOrderStatus, GoodsReceiptStatus, GoodsReceiptPostingStatus };
