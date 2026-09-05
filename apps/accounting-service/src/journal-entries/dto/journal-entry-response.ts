import { JournalEntryStatus, Prisma } from '../../../generated/prisma-client';
import { moneyToString } from '../../common/decimal';

interface JournalLineRow {
  id: string;
  tenantId: string;
  journalEntryId: string;
  lineNumber: number;
  accountId: string;
  debitAmount: Prisma.Decimal;
  creditAmount: Prisma.Decimal;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  account: { id: string; code: string; name: string };
}

interface JournalEntryRow {
  id: string;
  tenantId: string;
  entryNumber: string;
  entryDate: Date;
  description: string | null;
  status: JournalEntryStatus;
  postedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lines: JournalLineRow[];
}

function toJournalEntryResponse(row: JournalEntryRow) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    entryNumber: row.entryNumber,
    entryDate: row.entryDate,
    description: row.description,
    status: row.status,
    postedAt: row.postedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lines: row.lines.map((line) => ({
      id: line.id,
      tenantId: line.tenantId,
      journalEntryId: line.journalEntryId,
      lineNumber: line.lineNumber,
      accountId: line.accountId,
      account: line.account,
      debitAmount: moneyToString(line.debitAmount),
      creditAmount: moneyToString(line.creditAmount),
      description: line.description,
      createdAt: line.createdAt,
      updatedAt: line.updatedAt,
    })),
  };
}

export { toJournalEntryResponse };
