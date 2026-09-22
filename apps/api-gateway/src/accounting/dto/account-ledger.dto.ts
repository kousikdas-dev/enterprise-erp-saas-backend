import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class AccountLedgerQueryDto {
  @ApiPropertyOptional({
    description: 'UTC calendar date (YYYY-MM-DD), inclusive lower bound',
    example: '2026-01-01',
  })
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'fromDate must be in YYYY-MM-DD format' })
  fromDate?: string;

  @ApiPropertyOptional({
    description: 'UTC calendar date (YYYY-MM-DD), inclusive upper bound',
    example: '2026-01-31',
  })
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'toDate must be in YYYY-MM-DD format' })
  toDate?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class AccountLedgerAccountDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  type!: string;
}

export class AccountLedgerLineDto {
  @ApiProperty({ format: 'uuid' })
  journalEntryId!: string;

  @ApiProperty()
  entryNumber!: string;

  @ApiProperty({ description: 'UTC calendar date (YYYY-MM-DD)' })
  entryDate!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty()
  debitAmount!: string;

  @ApiProperty()
  creditAmount!: string;

  @ApiProperty()
  runningBalance!: string;

  @ApiPropertyOptional({ nullable: true })
  sourceService!: string | null;

  @ApiPropertyOptional({ nullable: true })
  sourceType!: string | null;

  @ApiPropertyOptional({ nullable: true })
  sourceId!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  reversesJournalEntryId!: string | null;
}

export class AccountLedgerResponseDto {
  @ApiProperty({ type: AccountLedgerAccountDto })
  account!: AccountLedgerAccountDto;

  @ApiPropertyOptional({ nullable: true })
  fromDate!: string | null;

  @ApiPropertyOptional({ nullable: true })
  toDate!: string | null;

  @ApiProperty()
  openingBalance!: string;

  @ApiProperty()
  closingBalance!: string;

  @ApiProperty({ type: [AccountLedgerLineDto] })
  items!: AccountLedgerLineDto[];

  @ApiProperty({ description: 'Number of matching ledger lines before pagination' })
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
