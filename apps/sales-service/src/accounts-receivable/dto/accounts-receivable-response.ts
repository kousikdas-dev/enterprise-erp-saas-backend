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
  outstandingInvoiceCount: number;
}

export function toCustomerArSummary(row: CustomerArSummaryRow) {
  const totalOutstanding = row.totalInvoiced.minus(row.totalPaid);
  return {
    customerId: row.customerId,
    customerCode: row.customerCode,
    customerName: row.customerName,
    totalInvoiced: moneyToString(row.totalInvoiced),
    totalPaid: moneyToString(row.totalPaid),
    totalOutstanding: moneyToString(totalOutstanding),
    outstandingInvoiceCount: row.outstandingInvoiceCount,
  };
}

// No status/reversedAt fields here — unlike SupplierPayment, SalesPayment
// has no reversal lifecycle in this phase (schema.prisma's own comment on
// SalesPayment.accountingPostingStatus: "No REVERSED here: SalesPayment has
// no reversal path in this phase").
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
  paymentStatus: string;
  status: string;
  payments?: CustomerArLedgerPaymentRow[];
}

export function toCustomerArLedgerItem(row: CustomerArLedgerItemRow) {
  const balanceDue = row.total.minus(row.amountPaid);
  return {
    invoiceId: row.invoiceId,
    invoiceNumber: row.invoiceNumber,
    customerId: row.customerId,
    customerName: row.customerName,
    invoiceDate: row.invoiceDate.toISOString().slice(0, 10),
    dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null,
    total: moneyToString(row.total),
    amountPaid: moneyToString(row.amountPaid),
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
 * INVOICE or PAYMENT line. No PAYMENT_REVERSAL line type: SalesPayment has
 * no reversal lifecycle in this phase (see the model comment), so unlike
 * the AP statement, a reversed-payment pair can never occur here. */
export interface CustomerArStatementRawRow {
  id: string;
  date: Date;
  type: 'INVOICE' | 'PAYMENT';
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
