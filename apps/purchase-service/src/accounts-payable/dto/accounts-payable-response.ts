import { Prisma } from '../../../generated/prisma-client';
import { moneyToString } from '../../common/decimal';

export type ApAgingBasis = 'DUE_DATE' | 'PAYMENT_TERM_DERIVED' | 'INVOICE_DATE_FALLBACK';
export type ApAgingBucket = 'CURRENT' | 'DAYS_1_30' | 'DAYS_31_60' | 'DAYS_61_90' | 'DAYS_90_PLUS';

export const AP_AGING_BUCKETS: readonly ApAgingBucket[] = [
  'CURRENT',
  'DAYS_1_30',
  'DAYS_31_60',
  'DAYS_61_90',
  'DAYS_90_PLUS',
];

export interface SupplierApSummaryRow {
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  totalInvoiced: Prisma.Decimal;
  totalPaid: Prisma.Decimal;
  outstandingInvoiceCount: number;
}

export function toSupplierApSummary(row: SupplierApSummaryRow) {
  const totalOutstanding = row.totalInvoiced.minus(row.totalPaid);
  return {
    supplierId: row.supplierId,
    supplierCode: row.supplierCode,
    supplierName: row.supplierName,
    totalInvoiced: moneyToString(row.totalInvoiced),
    totalPaid: moneyToString(row.totalPaid),
    totalOutstanding: moneyToString(totalOutstanding),
    outstandingInvoiceCount: row.outstandingInvoiceCount,
  };
}

export interface SupplierApLedgerPaymentRow {
  id: string;
  amount: Prisma.Decimal;
  paymentDate: Date;
  status: string;
  reversedAt: Date | null;
}

export interface SupplierApLedgerItemRow {
  invoiceId: string;
  invoiceNumber: string;
  supplierInvoiceNumber: string | null;
  supplierId: string;
  supplierName: string;
  invoiceDate: Date;
  dueDate: Date | null;
  total: Prisma.Decimal;
  amountPaid: Prisma.Decimal;
  paymentStatus: string;
  status: string;
  payments?: SupplierApLedgerPaymentRow[];
}

export function toSupplierApLedgerItem(row: SupplierApLedgerItemRow) {
  const balanceDue = row.total.minus(row.amountPaid);
  return {
    invoiceId: row.invoiceId,
    invoiceNumber: row.invoiceNumber,
    supplierInvoiceNumber: row.supplierInvoiceNumber,
    supplierId: row.supplierId,
    supplierName: row.supplierName,
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
            status: payment.status,
            reversedAt: payment.reversedAt ? payment.reversedAt.toISOString() : null,
          })),
        }
      : {}),
  };
}

export interface ApAgingRowInput {
  invoiceId: string;
  invoiceNumber: string;
  supplierId: string;
  supplierName: string;
  invoiceDate: Date;
  dueDate: Date | null;
  effectiveDueDate: Date;
  agingBasis: ApAgingBasis;
  balanceDue: Prisma.Decimal;
  daysOverdue: number;
  bucket: ApAgingBucket;
}

export function toApAgingRow(row: ApAgingRowInput) {
  return {
    invoiceId: row.invoiceId,
    invoiceNumber: row.invoiceNumber,
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    invoiceDate: row.invoiceDate.toISOString().slice(0, 10),
    dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null,
    effectiveDueDate: row.effectiveDueDate.toISOString().slice(0, 10),
    agingBasis: row.agingBasis,
    balanceDue: moneyToString(row.balanceDue),
    daysOverdue: row.daysOverdue,
    bucket: row.bucket,
  };
}

/** One row from the raw windowed supplier-statement query — a single
 * INVOICE, PAYMENT, or PAYMENT_REVERSAL line, mirroring
 * AccountLedgerRawRow's shape/role in accounting-service. */
export interface SupplierApStatementRawRow {
  id: string;
  date: Date;
  type: 'INVOICE' | 'PAYMENT' | 'PAYMENT_REVERSAL';
  reference: string;
  description: string | null;
  amount: Prisma.Decimal | string;
  cumulative: Prisma.Decimal | string;
}

export function toSupplierApStatementLine(
  row: SupplierApStatementRawRow,
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

export function toSupplierApStatement(params: {
  supplierId: string;
  supplierName: string;
  fromDate: string | null;
  toDate: string | null;
  openingBalance: Prisma.Decimal;
  closingBalance: Prisma.Decimal;
  rows: SupplierApStatementRawRow[];
  total: number;
  page: number;
  limit: number;
}) {
  const {
    supplierId,
    supplierName,
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
    supplierId,
    supplierName,
    fromDate,
    toDate,
    openingBalance: moneyToString(openingBalance),
    closingBalance: moneyToString(closingBalance),
    page,
    limit,
    total,
    items: rows.map((row) => toSupplierApStatementLine(row, openingBalance)),
  };
}

export function toApReconciliationSummary(params: {
  subledgerTotalOutstanding: Prisma.Decimal;
  glAccountId: string | null;
  glAccountsPayableBalance: Prisma.Decimal | null;
}) {
  const { subledgerTotalOutstanding, glAccountId, glAccountsPayableBalance } = params;
  const difference =
    glAccountsPayableBalance !== null
      ? subledgerTotalOutstanding.minus(glAccountsPayableBalance)
      : null;
  return {
    subledgerTotalOutstanding: moneyToString(subledgerTotalOutstanding),
    glAccountId,
    glAccountsPayableBalance:
      glAccountsPayableBalance !== null ? moneyToString(glAccountsPayableBalance) : null,
    difference: difference !== null ? moneyToString(difference) : null,
    matches: difference !== null && difference.isZero(),
  };
}
