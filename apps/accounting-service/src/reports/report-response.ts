import { AccountType, Prisma } from '../../generated/prisma-client';
import { moneyToString } from '../common/decimal';

export interface ReportAccountRow {
  id: string;
  code: string;
  name: string;
  type: AccountType;
}

export interface TrialBalanceLine {
  account: ReportAccountRow;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
}

export function toTrialBalanceResponse(params: {
  asOfDate: string;
  lines: TrialBalanceLine[];
}) {
  const { asOfDate, lines } = params;
  let totalDebit = new Prisma.Decimal(0);
  let totalCredit = new Prisma.Decimal(0);
  for (const line of lines) {
    totalDebit = totalDebit.plus(line.debit);
    totalCredit = totalCredit.plus(line.credit);
  }
  return {
    asOfDate,
    items: lines.map((line) => ({
      account: line.account,
      debit: moneyToString(line.debit),
      credit: moneyToString(line.credit),
    })),
    totalDebit: moneyToString(totalDebit),
    totalCredit: moneyToString(totalCredit),
    // True by construction of double-entry posting — surfaced explicitly
    // rather than assumed, since a Trial Balance's entire purpose is to be
    // the place drift would be caught if it ever existed.
    balanced: totalDebit.eq(totalCredit),
  };
}

export interface ProfitLossLine {
  account: ReportAccountRow;
  amount: Prisma.Decimal;
}

export function toProfitLossResponse(params: {
  fromDate: string;
  toDate: string;
  revenueLines: ProfitLossLine[];
  expenseLines: ProfitLossLine[];
}) {
  const { fromDate, toDate, revenueLines, expenseLines } = params;
  const totalRevenue = revenueLines.reduce(
    (sum, line) => sum.plus(line.amount),
    new Prisma.Decimal(0),
  );
  const totalExpense = expenseLines.reduce(
    (sum, line) => sum.plus(line.amount),
    new Prisma.Decimal(0),
  );
  const netIncome = totalRevenue.minus(totalExpense);
  return {
    fromDate,
    toDate,
    revenue: {
      items: revenueLines.map((line) => ({
        account: line.account,
        amount: moneyToString(line.amount),
      })),
      total: moneyToString(totalRevenue),
    },
    expenses: {
      items: expenseLines.map((line) => ({
        account: line.account,
        amount: moneyToString(line.amount),
      })),
      total: moneyToString(totalExpense),
    },
    netIncome: moneyToString(netIncome),
  };
}

export interface BalanceSheetLine {
  account: ReportAccountRow;
  amount: Prisma.Decimal;
}

export function toBalanceSheetResponse(params: {
  asOfDate: string;
  assetLines: BalanceSheetLine[];
  liabilityLines: BalanceSheetLine[];
  equityLines: BalanceSheetLine[];
  netIncome: Prisma.Decimal;
}) {
  const { asOfDate, assetLines, liabilityLines, equityLines, netIncome } = params;
  const totalAssets = assetLines.reduce(
    (sum, line) => sum.plus(line.amount),
    new Prisma.Decimal(0),
  );
  const totalLiabilities = liabilityLines.reduce(
    (sum, line) => sum.plus(line.amount),
    new Prisma.Decimal(0),
  );
  const totalEquityAccounts = equityLines.reduce(
    (sum, line) => sum.plus(line.amount),
    new Prisma.Decimal(0),
  );
  // No period-closing/FiscalPeriod concept exists in this schema (see
  // schema.prisma's header comment) — Revenue/Expense balances are never
  // actually transferred into an Equity account by a closing entry. Net
  // Income since inception, up to asOfDate, is folded in here as a
  // computed "Retained Earnings" line so the balance sheet still satisfies
  // the fundamental accounting equation (Assets = Liabilities + Equity),
  // which otherwise could never hold without it.
  const totalEquity = totalEquityAccounts.plus(netIncome);
  return {
    asOfDate,
    assets: {
      items: assetLines.map((line) => ({
        account: line.account,
        amount: moneyToString(line.amount),
      })),
      total: moneyToString(totalAssets),
    },
    liabilities: {
      items: liabilityLines.map((line) => ({
        account: line.account,
        amount: moneyToString(line.amount),
      })),
      total: moneyToString(totalLiabilities),
    },
    equity: {
      items: equityLines.map((line) => ({
        account: line.account,
        amount: moneyToString(line.amount),
      })),
      retainedEarnings: moneyToString(netIncome),
      total: moneyToString(totalEquity),
    },
    totalLiabilitiesAndEquity: moneyToString(totalLiabilities.plus(totalEquity)),
    // True by construction (the fundamental accounting equation) —
    // surfaced explicitly for the same auditability reason as Trial
    // Balance's own `balanced` field.
    balanced: totalAssets.eq(totalLiabilities.plus(totalEquity)),
  };
}
