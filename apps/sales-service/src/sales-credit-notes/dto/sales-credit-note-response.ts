import {
  Prisma,
  SalesCreditNotePostingStatus,
  SalesCreditNoteStatus,
} from '../../../generated/prisma-client';
import { moneyToString, quantityToString } from '../../common/decimal';

type SalesCreditNoteWithItems = {
  id: string;
  tenantId: string;
  creditNoteNumber: string;
  customerId: string;
  customerName: string;
  customerGstin: string | null;
  customerBillingAddress: string | null;
  salesInvoiceId: string | null;
  creditNoteDate: Date;
  reason: string | null;
  notes: string | null;
  subtotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  taxTotal: Prisma.Decimal;
  total: Prisma.Decimal;
  status: SalesCreditNoteStatus;
  postedAt: Date | null;
  postedBy: string | null;
  reversedAt: Date | null;
  reversedBy: string | null;
  reversalReason: string | null;
  accountingPostingStatus: SalesCreditNotePostingStatus;
  journalEntryId: string | null;
  reversalJournalEntryId: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    tenantId: string;
    salesCreditNoteId: string;
    description: string;
    quantity: Prisma.Decimal;
    unitPrice: Prisma.Decimal;
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

function toTaxComponentResponse(component: {
  id: string;
  sequence: number;
  type: string;
  name: string | null;
  rate: Prisma.Decimal;
  componentTaxAmount: Prisma.Decimal;
}) {
  return {
    id: component.id,
    sequence: component.sequence,
    type: component.type,
    name: component.name,
    rate: component.rate.toFixed(4),
    componentTaxAmount: moneyToString(component.componentTaxAmount),
  };
}

export function toSalesCreditNoteResponse(row: SalesCreditNoteWithItems) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    creditNoteNumber: row.creditNoteNumber,
    customerId: row.customerId,
    customerName: row.customerName,
    customerGstin: row.customerGstin,
    customerBillingAddress: row.customerBillingAddress,
    salesInvoiceId: row.salesInvoiceId,
    creditNoteDate: row.creditNoteDate.toISOString().slice(0, 10),
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
      salesCreditNoteId: item.salesCreditNoteId,
      description: item.description,
      quantity: quantityToString(item.quantity),
      unitPrice: moneyToString(item.unitPrice),
      discountPercent: item.discountPercent.toFixed(2),
      discountAmount: moneyToString(item.discountAmount),
      taxCodeId: item.taxCodeId,
      taxCode: item.taxCode,
      taxCodeName: item.taxCodeName,
      taxAmount: moneyToString(item.taxAmount),
      lineSubtotal: moneyToString(item.lineSubtotal),
      lineTotal: moneyToString(item.lineTotal),
      taxComponents: (item.taxComponents ?? []).map(toTaxComponentResponse),
    })),
  };
}

export { SalesCreditNoteStatus, SalesCreditNotePostingStatus };
