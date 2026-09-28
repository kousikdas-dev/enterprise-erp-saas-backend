import { Prisma } from '../../../generated/prisma-client';
import { moneyToString } from '../../common/decimal';

export type ArAgingBasis = 'DUE_DATE' | 'PAYMENT_TERM_DERIVED' | 'INVOICE_DATE_FALLBACK';
export type ArAgingBucket = 'CURRENT' | 'DAYS_1_30' | 'DAYS_31_60' | 'DAYS_61_90' | 'DAYS_90_PLUS';

export const AR_AGING_BUCKETS: readonly ArAgingBucket[] = [
  'CURRENT',
  'DAYS_1_30',
  'DAYS_31_60',
  'DAYS_61_90',
  'DAYS_90_PLUS',
];

export interface CustomerArSummaryRow {
  customerId: string;
  customerCode: string;
  customerName: string;
  totalInvoiced: Prisma.Decimal;
  totalPaid: Prisma.Decimal;
  // Phase 3.12 (Sales Return / Credit Note) — cumulative CONFIRMED Sales
  // Return credit against this customer's invoices.
  totalCredited: Prisma.Decimal;
  // Phase 3.14 (Standalone Sales Credit Note) — Σtotal of this customer's
  // currently-POSTED (not yet REVERSED) standalone Credit Notes. A REVERSED
  // one is excluded entirely (its reduction no longer applies), never
  // subtracted-then-added-back. Deliberately separate from totalCredited
  // above — a standalone Credit Note is not a SalesReturn.
  totalCreditNotes: Prisma.Decimal;
  outstandingInvoiceCount: number;
}

export function toCustomerArSummary(row: CustomerArSummaryRow) {
  const totalOutstanding = row.totalInvoiced
    .minus(row.totalPaid)
    .minus(row.totalCredited)
    .minus(row.totalCreditNotes);
  return {
    customerId: row.customerId,
    customerCode: row.customerCode,
    customerName: row.customerName,
    totalInvoiced: moneyToString(row.totalInvoiced),
    totalPaid: moneyToString(row.totalPaid),
    totalCredited: moneyToString(row.totalCredited),
    totalCreditNotes: moneyToString(row.totalCreditNotes),
    totalOutstanding: moneyToString(totalOutstanding),
    outstandingInvoiceCount: row.outstandingInvoiceCount,
  };
}

export interface CustomerArLedgerPaymentRow {
  id: string;
  amount: Prisma.Decimal;
  paymentDate: Date;
}

export interface CustomerArLedgerItemRow {
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  invoiceDate: Date;
  dueDate: Date | null;
  total: Prisma.Decimal;
  amountPaid: Prisma.Decimal;
  // Phase 3.12 (Sales Return / Credit Note).
  amountCredited: Prisma.Decimal;
  paymentStatus: string;
  status: string;
  payments?: CustomerArLedgerPaymentRow[];
}

export function toCustomerArLedgerItem(row: CustomerArLedgerItemRow) {
  const balanceDue = row.total.minus(row.amountPaid).minus(row.amountCredited);
  return {
    invoiceId: row.invoiceId,
    invoiceNumber: row.invoiceNumber,
    customerId: row.customerId,
    customerName: row.customerName,
    invoiceDate: row.invoiceDate.toISOString().slice(0, 10),
    dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null,
    total: moneyToString(row.total),
    amountPaid: moneyToString(row.amountPaid),
    amountCredited: moneyToString(row.amountCredited),
    balanceDue: moneyToString(balanceDue),
    paymentStatus: row.paymentStatus,
    status: row.status,
    ...(row.payments
      ? {
          payments: row.payments.map((payment) => ({
            id: payment.id,
            amount: moneyToString(payment.amount),
            paymentDate: payment.paymentDate.toISOString().slice(0, 10),
          })),
        }
      : {}),
  };
}

export interface ArAgingRowInput {
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  invoiceDate: Date;
  dueDate: Date | null;
  effectiveDueDate: Date;
  agingBasis: ArAgingBasis;
  balanceDue: Prisma.Decimal;
  daysOverdue: number;
  bucket: ArAgingBucket;
}

export function toArAgingRow(row: ArAgingRowInput) {
  return {
    invoiceId: row.invoiceId,
    invoiceNumber: row.invoiceNumber,
    customerId: row.customerId,
    customerName: row.customerName,
    invoiceDate: row.invoiceDate.toISOString().slice(0, 10),
    dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null,
    effectiveDueDate: row.effectiveDueDate.toISOString().slice(0, 10),
    agingBasis: row.agingBasis,
    balanceDue: moneyToString(row.balanceDue),
    daysOverdue: row.daysOverdue,
    bucket: row.bucket,
  };
}

/** One row from the raw windowed customer-statement query — a single
 * INVOICE, PAYMENT, CREDIT_NOTE, SALES_CREDIT_NOTE, or
 * SALES_CREDIT_NOTE_REVERSAL line. CREDIT_NOTE (Phase 3.12) is sourced only
 * from CONFIRMED Sales Returns — a return that is later REVERSED simply
 * stops appearing (its net effect on SalesInvoice.amountCredited is already
 * zero), rather than emitting an offsetting reversal line; mirrors this
 * statement's own existing convention (the PAYMENT line above likewise has
 * no PAYMENT_REVERSAL counterpart). SALES_CREDIT_NOTE /
 * SALES_CREDIT_NOTE_REVERSAL (Phase 3.14) are the standalone Credit Note's
 * own, distinct pair — deliberately never merged with CREDIT_NOTE above. */
export interface CustomerArStatementRawRow {
  id: string;
  date: Date;
  type: 'INVOICE' | 'PAYMENT' | 'CREDIT_NOTE' | 'SALES_CREDIT_NOTE' | 'SALES_CREDIT_NOTE_REVERSAL';
  reference: string;
  description: string | null;
  amount: Prisma.Decimal | string;
  cumulative: Prisma.Decimal | string;
}

export function toCustomerArStatementLine(
  row: CustomerArStatementRawRow,
  openingBalance: Prisma.Decimal,
) {
  return {
    date: row.date.toISOString().slice(0, 10),
    type: row.type,
    reference: row.reference,
    description: row.description,
    amount: moneyToString(new Prisma.Decimal(row.amount)),
    runningBalance: moneyToString(openingBalance.plus(new Prisma.Decimal(row.cumulative))),
  };
}

export function toCustomerArStatement(params: {
  customerId: string;
  customerName: string;
  fromDate: string | null;
  toDate: string | null;
  openingBalance: Prisma.Decimal;
  closingBalance: Prisma.Decimal;
  rows: CustomerArStatementRawRow[];
  total: number;
  page: number;
  limit: number;
}) {
  const {
    customerId,
    customerName,
    fromDate,
    toDate,
    openingBalance,
    closingBalance,
    rows,
    total,
    page,
    limit,
  } = params;

  return {
    customerId,
    customerName,
    fromDate,
    toDate,
    openingBalance: moneyToString(openingBalance),
    closingBalance: moneyToString(closingBalance),
    page,
    limit,
    total,
    items: rows.map((row) => toCustomerArStatementLine(row, openingBalance)),
  };
}

export function toArReconciliationSummary(params: {
  subledgerTotalOutstanding: Prisma.Decimal;
  glAccountId: string | null;
  glAccountsReceivableBalance: Prisma.Decimal | null;
}) {
  const { subledgerTotalOutstanding, glAccountId, glAccountsReceivableBalance } = params;
  const difference =
    glAccountsReceivableBalance !== null
      ? subledgerTotalOutstanding.minus(glAccountsReceivableBalance)
      : null;
  return {
    subledgerTotalOutstanding: moneyToString(subledgerTotalOutstanding),
    glAccountId,
    glAccountsReceivableBalance:
      glAccountsReceivableBalance !== null ? moneyToString(glAccountsReceivableBalance) : null,
    difference: difference !== null ? moneyToString(difference) : null,
    matches: difference !== null && difference.isZero(),
  };
}
