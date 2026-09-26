import {
  Prisma,
  SalesPaymentPostingStatus,
  SalesPaymentStatus,
} from '../../../generated/prisma-client';
import { moneyToString } from '../../common/decimal';

type SalesPaymentRow = {
  id: string;
  tenantId: string;
  salesInvoiceId: string;
  amount: Prisma.Decimal;
  paymentDate: Date;
  paymentMethodId: string | null;
  reference: string | null;
  notes: string | null;
  status: SalesPaymentStatus;
  accountingPostingStatus: SalesPaymentPostingStatus;
  journalEntryId: string | null;
  reversalJournalEntryId: string | null;
  reversedAt: Date | null;
  reversalReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toSalesPaymentResponse(row: SalesPaymentRow) {
  return {
    id: row.id,
    salesInvoiceId: row.salesInvoiceId,
    amount: moneyToString(row.amount),
    paymentDate: row.paymentDate,
    paymentMethodId: row.paymentMethodId,
    reference: row.reference,
    notes: row.notes,
    status: row.status,
    accountingPostingStatus: row.accountingPostingStatus,
    journalEntryId: row.journalEntryId,
    reversalJournalEntryId: row.reversalJournalEntryId,
    reversedAt: row.reversedAt,
    reversalReason: row.reversalReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export { SalesPaymentPostingStatus, SalesPaymentStatus };
