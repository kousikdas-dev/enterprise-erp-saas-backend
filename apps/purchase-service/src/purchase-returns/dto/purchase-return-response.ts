import {
  Prisma,
  PurchaseReturnAllocationType,
  PurchaseReturnPostingStatus,
  PurchaseReturnStatus,
} from '../../../generated/prisma-client';
import { moneyToString, quantityToString } from '../../common/decimal';

type ReturnWithItems = {
  id: string;
  tenantId: string;
  returnNumber: string;
  goodsReceiptId: string;
  warehouseId: string;
  status: PurchaseReturnStatus;
  reason: string | null;
  returnedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  accountingPostingStatus: PurchaseReturnPostingStatus;
  journalEntryId: string | null;
  reversalJournalEntryId: string | null;
  reversedAt: Date | null;
  reversalReason: string | null;
  items: Array<{
    id: string;
    tenantId: string;
    purchaseReturnId: string;
    goodsReceiptItemId: string;
    productId: string;
    productSku: string;
    productName: string;
    unitOfMeasureId: string | null;
    uomCode: string | null;
    uomName: string | null;
    conversionFactor: Prisma.Decimal | null;
    quantity: Prisma.Decimal;
    baseQuantity: Prisma.Decimal;
    createdAt: Date;
    updatedAt: Date;
    allocations?: Array<{
      id: string;
      tenantId: string;
      purchaseReturnItemId: string;
      allocationType: PurchaseReturnAllocationType;
      purchaseInvoiceItemId: string | null;
      baseQuantity: Prisma.Decimal;
      receiptUnitCost: Prisma.Decimal;
      receiptCostAmount: Prisma.Decimal;
      invoiceUnitCost: Prisma.Decimal | null;
      invoiceCostAmount: Prisma.Decimal | null;
      ppvAmount: Prisma.Decimal | null;
      createdAt: Date;
    }>;
  }>;
};

export function toPurchaseReturnResponse(row: ReturnWithItems) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    returnNumber: row.returnNumber,
    goodsReceiptId: row.goodsReceiptId,
    warehouseId: row.warehouseId,
    status: row.status,
    reason: row.reason,
    returnedAt: row.returnedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    accountingPostingStatus: row.accountingPostingStatus,
    journalEntryId: row.journalEntryId,
    reversalJournalEntryId: row.reversalJournalEntryId,
    reversedAt: row.reversedAt,
    reversalReason: row.reversalReason,
    items: row.items.map((item) => ({
      id: item.id,
      tenantId: item.tenantId,
      purchaseReturnId: item.purchaseReturnId,
      goodsReceiptItemId: item.goodsReceiptItemId,
      productId: item.productId,
      productSku: item.productSku,
      productName: item.productName,
      unitOfMeasureId: item.unitOfMeasureId,
      uomCode: item.uomCode,
      uomName: item.uomName,
      conversionFactor: item.conversionFactor
        ? quantityToString(item.conversionFactor)
        : null,
      quantity: quantityToString(item.quantity),
      baseQuantity: quantityToString(item.baseQuantity),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      allocations: (item.allocations ?? []).map((allocation) => ({
        id: allocation.id,
        allocationType: allocation.allocationType,
        purchaseInvoiceItemId: allocation.purchaseInvoiceItemId,
        baseQuantity: quantityToString(allocation.baseQuantity),
        receiptUnitCost: moneyToString(allocation.receiptUnitCost),
        receiptCostAmount: moneyToString(allocation.receiptCostAmount),
        invoiceUnitCost: allocation.invoiceUnitCost
          ? moneyToString(allocation.invoiceUnitCost)
          : null,
        invoiceCostAmount: allocation.invoiceCostAmount
          ? moneyToString(allocation.invoiceCostAmount)
          : null,
        ppvAmount: allocation.ppvAmount
          ? moneyToString(allocation.ppvAmount)
          : null,
        createdAt: allocation.createdAt,
      })),
    })),
  };
}

export { PurchaseReturnStatus, PurchaseReturnPostingStatus, PurchaseReturnAllocationType };
