import { AccountType, Prisma } from '../../../generated/prisma-client';
import { moneyToString } from '../../common/decimal';

export interface AccountLedgerAccountRow {
  id: string;
  code: string;
  name: string;
  type: AccountType;
}

/** One row returned by the raw windowed ledger query, per JournalLine. */
export interface AccountLedgerRawRow {
  id: string;
  journalEntryId: string;
  entryNumber: string;
  entryDate: Date;
  lineDescription: string | null;
  entryDescription: string | null;
  debitAmount: Prisma.Decimal | string;
  creditAmount: Prisma.Decimal | string;
  sourceService: string | null;
  sourceType: string | null;
  sourceId: string | null;
  reversesJournalEntryId: string | null;
  cumulative: Prisma.Decimal | string;
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function toAccountLedgerLine(
  row: AccountLedgerRawRow,
  openingBalance: Prisma.Decimal,
) {
  return {
    journalEntryId: row.journalEntryId,
    entryNumber: row.entryNumber,
    entryDate: toDateOnly(row.entryDate),
    description: row.lineDescription ?? row.entryDescription ?? null,
    debitAmount: moneyToString(new Prisma.Decimal(row.debitAmount)),
    creditAmount: moneyToString(new Prisma.Decimal(row.creditAmount)),
    runningBalance: moneyToString(
      openingBalance.plus(new Prisma.Decimal(row.cumulative)),
    ),
    sourceService: row.sourceService,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    reversesJournalEntryId: row.reversesJournalEntryId,
  };
}

export function toAccountLedgerResponse(params: {
  account: AccountLedgerAccountRow;
  fromDate: string | null;
  toDate: string | null;
  openingBalance: Prisma.Decimal;
  closingBalance: Prisma.Decimal;
  rows: AccountLedgerRawRow[];
  total: number;
  page: number;
  limit: number;
}) {
  const { account, fromDate, toDate, openingBalance, closingBalance, rows, total, page, limit } =
    params;

  return {
    account: {
      id: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
    },
    fromDate,
    toDate,
    openingBalance: moneyToString(openingBalance),
    closingBalance: moneyToString(closingBalance),
    items: rows.map((row) => toAccountLedgerLine(row, openingBalance)),
    total,
    page,
    limit,
  };
}
