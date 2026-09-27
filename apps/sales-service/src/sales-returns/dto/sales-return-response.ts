import {
  Prisma,
  SalesReturnPostingStatus,
  SalesReturnStatus,
} from '../../../generated/prisma-client';
import { moneyToString, quantityToString } from '../../common/decimal';

type ReturnWithItems = {
  id: string;
  tenantId: string;
  returnNumber: string;
  salesInvoiceId: string;
  warehouseId: string | null;
  status: SalesReturnStatus;
  reason: string | null;
  returnedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  accountingPostingStatus: SalesReturnPostingStatus;
  journalEntryId: string | null;
  reversalJournalEntryId: string | null;
  reversedAt: Date | null;
  reversalReason: string | null;
  items: Array<{
    id: string;
    tenantId: string;
    salesReturnId: string;
    salesInvoiceItemId: string | null;
    shipmentItemId: string | null;
    productId: string;
    productSku: string;
    productName: string;
    quantity: Prisma.Decimal;
    baseQuantity: Prisma.Decimal | null;
    unitPrice: Prisma.Decimal | null;
    discountPercent: Prisma.Decimal | null;
    discountAmount: Prisma.Decimal | null;
    taxCodeId: string | null;
    taxCode: string | null;
    taxCodeName: string | null;
    taxAmount: Prisma.Decimal | null;
    lineSubtotal: Prisma.Decimal | null;
    lineTotal: Prisma.Decimal | null;
    unitCost: Prisma.Decimal | null;
    totalCost: Prisma.Decimal | null;
    inventoryMovementId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
};

export function toSalesReturnResponse(row: ReturnWithItems) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    returnNumber: row.returnNumber,
    salesInvoiceId: row.salesInvoiceId,
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
      salesReturnId: item.salesReturnId,
      salesInvoiceItemId: item.salesInvoiceItemId,
      shipmentItemId: item.shipmentItemId,
      productId: item.productId,
      productSku: item.productSku,
      productName: item.productName,
      quantity: quantityToString(item.quantity),
      baseQuantity: item.baseQuantity ? quantityToString(item.baseQuantity) : null,
      unitPrice: item.unitPrice ? moneyToString(item.unitPrice) : null,
      discountPercent: item.discountPercent ? item.discountPercent.toString() : null,
      discountAmount: item.discountAmount ? moneyToString(item.discountAmount) : null,
      taxCodeId: item.taxCodeId,
      taxCode: item.taxCode,
      taxCodeName: item.taxCodeName,
      taxAmount: item.taxAmount ? moneyToString(item.taxAmount) : null,
      lineSubtotal: item.lineSubtotal ? moneyToString(item.lineSubtotal) : null,
      lineTotal: item.lineTotal ? moneyToString(item.lineTotal) : null,
      unitCost: item.unitCost ? moneyToString(item.unitCost) : null,
      totalCost: item.totalCost ? moneyToString(item.totalCost) : null,
      inventoryMovementId: item.inventoryMovementId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
  };
}

export { SalesReturnStatus, SalesReturnPostingStatus };
