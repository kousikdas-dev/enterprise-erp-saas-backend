import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

// Deliberately stricter than JournalEntry.entryDate's own @IsISO8601()
// (which accepts any ISO8601 form) — the ledger needs unambiguous UTC
// calendar-day boundaries, so only a bare YYYY-MM-DD date is accepted.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class AccountLedgerQueryDto {
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'fromDate must be in YYYY-MM-DD format' })
  fromDate?: string;

  @IsOptional()
  @Matches(DATE_ONLY, { message: 'toDate must be in YYYY-MM-DD format' })
  toDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 50;
}
