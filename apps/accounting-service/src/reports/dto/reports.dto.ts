import { IsOptional, Matches } from 'class-validator';

// Same strict YYYY-MM-DD-only pattern as AccountLedgerQueryDto — unambiguous
// UTC calendar-day boundaries, never a full ISO8601 timestamp.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class TrialBalanceQueryDto {
  // Optional — omitted means "as of today" (UTC), the most useful default
  // for a report whose whole point is "where do things stand right now".
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'asOfDate must be in YYYY-MM-DD format' })
  asOfDate?: string;
}

export class ProfitLossQueryDto {
  // Both required — unlike the Ledger's optional range (whose "all time"
  // default is meaningful for one account), an unbounded P&L mixes every
  // fiscal period ever posted into one figure, which is rarely what's
  // wanted and is better requested explicitly (fromDate = the account's
  // very first entryDate) than defaulted silently.
  @Matches(DATE_ONLY, { message: 'fromDate must be in YYYY-MM-DD format' })
  fromDate!: string;

  @Matches(DATE_ONLY, { message: 'toDate must be in YYYY-MM-DD format' })
  toDate!: string;
}

export class BalanceSheetQueryDto {
  // Optional — same "as of today" default as Trial Balance.
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'asOfDate must be in YYYY-MM-DD format' })
  asOfDate?: string;
}
