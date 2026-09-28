import {
  DebitNotePostingStatus,
  DebitNoteStatus,
  Prisma,
} from '../../../generated/prisma-client';
import { moneyToString, quantityToString } from '../../common/decimal';

type DebitNoteWithItems = {
  id: string;
  tenantId: string;
  debitNoteNumber: string;
  supplierId: string;
  supplierName: string;
  supplierGstin: string | null;
  supplierBillingAddress: string | null;
  purchaseInvoiceId: string | null;
  debitNoteDate: Date;
  reason: string | null;
  notes: string | null;
  subtotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  taxTotal: Prisma.Decimal;
  total: Prisma.Decimal;
  status: DebitNoteStatus;
  postedAt: Date | null;
  postedBy: string | null;
  reversedAt: Date | null;
  reversedBy: string | null;
  reversalReason: string | null;
  accountingPostingStatus: DebitNotePostingStatus;
  journalEntryId: string | null;
  reversalJournalEntryId: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    tenantId: string;
    purchaseDebitNoteId: string;
    description: string;
    quantity: Prisma.Decimal;
    unitCost: Prisma.Decimal;
    discountPercent: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    taxCodeId: string | null;
    taxCode: string | null;
    taxCodeName: string | null;
    taxAmount: Prisma.Decimal;
    lineSubtotal: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
    createdAt: Date;
    updatedAt: Date;
    taxComponents?: Array<{
      id: string;
      sequence: number;
      type: string;
      name: string | null;
      rate: Prisma.Decimal;
      componentTaxAmount: Prisma.Decimal;
    }>;
  }>;
};

export function toPurchaseDebitNoteResponse(row: DebitNoteWithItems) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    debitNoteNumber: row.debitNoteNumber,
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    supplierGstin: row.supplierGstin,
    supplierBillingAddress: row.supplierBillingAddress,
    purchaseInvoiceId: row.purchaseInvoiceId,
    debitNoteDate: row.debitNoteDate.toISOString().slice(0, 10),
    reason: row.reason,
    notes: row.notes,
    subtotal: moneyToString(row.subtotal),
    discountTotal: moneyToString(row.discountTotal),
    taxTotal: moneyToString(row.taxTotal),
    total: moneyToString(row.total),
    status: row.status,
    postedAt: row.postedAt ? row.postedAt.toISOString() : null,
    postedBy: row.postedBy,
    reversedAt: row.reversedAt ? row.reversedAt.toISOString() : null,
    reversedBy: row.reversedBy,
    reversalReason: row.reversalReason,
    accountingPostingStatus: row.accountingPostingStatus,
    journalEntryId: row.journalEntryId,
    reversalJournalEntryId: row.reversalJournalEntryId,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    items: row.items.map((item) => ({
      id: item.id,
      purchaseDebitNoteId: item.purchaseDebitNoteId,
      description: item.description,
      quantity: quantityToString(item.quantity),
      unitCost: moneyToString(item.unitCost),
      discountPercent: item.discountPercent.toFixed(2),
      discountAmount: moneyToString(item.discountAmount),
      taxCodeId: item.taxCodeId,
      taxCode: item.taxCode,
      taxCodeName: item.taxCodeName,
      taxAmount: moneyToString(item.taxAmount),
      lineSubtotal: moneyToString(item.lineSubtotal),
      lineTotal: moneyToString(item.lineTotal),
      taxComponents: (item.taxComponents ?? []).map((component) => ({
        id: component.id,
        sequence: component.sequence,
        type: component.type,
        name: component.name,
        rate: component.rate.toFixed(4),
        componentTaxAmount: moneyToString(component.componentTaxAmount),
      })),
    })),
  };
}

export { DebitNoteStatus, DebitNotePostingStatus };
