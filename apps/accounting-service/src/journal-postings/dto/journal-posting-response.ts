import { JournalEntryStatus, Prisma } from '../../../generated/prisma-client';
import { moneyToString } from '../../common/decimal';

interface JournalPostingLineRow {
  id: string;
  lineNumber: number;
  accountId: string;
  debitAmount: Prisma.Decimal;
  creditAmount: Prisma.Decimal;
  description: string | null;
  account?: { id: string; code: string; name: string };
}

interface JournalPostingRow {
  id: string;
  tenantId: string;
  entryNumber: string;
  entryDate: Date;
  description: string | null;
  status: JournalEntryStatus;
  postedAt: Date | null;
  sourceService: string | null;
  sourceType: string | null;
  sourceId: string | null;
  reversesJournalEntryId: string | null;
  createdAt: Date;
  updatedAt: Date;
  lines: JournalPostingLineRow[];
}

function toJournalPostingResponse(
  row: JournalPostingRow,
  idempotentReplay: boolean,
) {
  let totalDebit = new Prisma.Decimal(0);
  let totalCredit = new Prisma.Decimal(0);
  for (const line of row.lines) {
    totalDebit = totalDebit.plus(line.debitAmount);
    totalCredit = totalCredit.plus(line.creditAmount);
  }

  return {
    id: row.id,
    tenantId: row.tenantId,
    entryNumber: row.entryNumber,
    entryDate: row.entryDate,
    description: row.description,
    status: row.status,
    postedAt: row.postedAt,
    sourceService: row.sourceService,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    reversesJournalEntryId: row.reversesJournalEntryId,
    idempotentReplay,
    totalDebit: moneyToString(totalDebit),
    totalCredit: moneyToString(totalCredit),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lines: row.lines.map((line) => ({
      id: line.id,
      lineNumber: line.lineNumber,
      accountId: line.accountId,
      account: line.account ?? null,
      debitAmount: moneyToString(line.debitAmount),
      creditAmount: moneyToString(line.creditAmount),
      description: line.description,
    })),
  };
}

export { toJournalPostingResponse };
