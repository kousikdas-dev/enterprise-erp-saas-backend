import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class TrialBalanceQueryDto {
  @ApiPropertyOptional({
    description: 'UTC calendar date (YYYY-MM-DD). Defaults to today.',
    example: '2026-01-31',
  })
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'asOfDate must be in YYYY-MM-DD format' })
  asOfDate?: string;
}

export class ProfitLossQueryDto {
  @ApiProperty({
    description: 'UTC calendar date (YYYY-MM-DD), inclusive lower bound',
    example: '2026-01-01',
  })
  @Matches(DATE_ONLY, { message: 'fromDate must be in YYYY-MM-DD format' })
  fromDate!: string;

  @ApiProperty({
    description: 'UTC calendar date (YYYY-MM-DD), inclusive upper bound',
    example: '2026-01-31',
  })
  @Matches(DATE_ONLY, { message: 'toDate must be in YYYY-MM-DD format' })
  toDate!: string;
}

export class BalanceSheetQueryDto {
  @ApiPropertyOptional({
    description: 'UTC calendar date (YYYY-MM-DD). Defaults to today.',
    example: '2026-01-31',
  })
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'asOfDate must be in YYYY-MM-DD format' })
  asOfDate?: string;
}

export class ReportAccountDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  type!: string;
}

export class TrialBalanceLineDto {
  @ApiProperty({ type: ReportAccountDto })
  account!: ReportAccountDto;

  @ApiProperty()
  debit!: string;

  @ApiProperty()
  credit!: string;
}

export class TrialBalanceResponseDto {
  @ApiProperty({ description: 'UTC calendar date (YYYY-MM-DD)' })
  asOfDate!: string;

  @ApiProperty({ type: [TrialBalanceLineDto] })
  items!: TrialBalanceLineDto[];

  @ApiProperty()
  totalDebit!: string;

  @ApiProperty()
  totalCredit!: string;

  @ApiProperty({
    description: 'True when totalDebit equals totalCredit, as double-entry posting guarantees',
  })
  balanced!: boolean;
}

export class ProfitLossLineDto {
  @ApiProperty({ type: ReportAccountDto })
  account!: ReportAccountDto;

  @ApiProperty()
  amount!: string;
}

export class ProfitLossSectionDto {
  @ApiProperty({ type: [ProfitLossLineDto] })
  items!: ProfitLossLineDto[];

  @ApiProperty()
  total!: string;
}

export class ProfitLossResponseDto {
  @ApiProperty({ description: 'UTC calendar date (YYYY-MM-DD)' })
  fromDate!: string;

  @ApiProperty({ description: 'UTC calendar date (YYYY-MM-DD)' })
  toDate!: string;

  @ApiProperty({ type: ProfitLossSectionDto })
  revenue!: ProfitLossSectionDto;

  @ApiProperty({ type: ProfitLossSectionDto })
  expenses!: ProfitLossSectionDto;

  @ApiProperty()
  netIncome!: string;
}

export class BalanceSheetLineDto {
  @ApiProperty({ type: ReportAccountDto })
  account!: ReportAccountDto;

  @ApiProperty()
  amount!: string;
}

export class BalanceSheetSectionDto {
  @ApiProperty({ type: [BalanceSheetLineDto] })
  items!: BalanceSheetLineDto[];

  @ApiProperty()
  total!: string;
}

export class BalanceSheetEquitySectionDto extends BalanceSheetSectionDto {
  @ApiProperty({
    description:
      'Net Income accumulated since inception up to asOfDate, folded into Equity — this ' +
      'schema has no period-closing concept, so this computed line is what makes the ' +
      'balance sheet satisfy Assets = Liabilities + Equity.',
  })
  retainedEarnings!: string;
}

export class BalanceSheetResponseDto {
  @ApiProperty({ description: 'UTC calendar date (YYYY-MM-DD)' })
  asOfDate!: string;

  @ApiProperty({ type: BalanceSheetSectionDto })
  assets!: BalanceSheetSectionDto;

  @ApiProperty({ type: BalanceSheetSectionDto })
  liabilities!: BalanceSheetSectionDto;

  @ApiProperty({ type: BalanceSheetEquitySectionDto })
  equity!: BalanceSheetEquitySectionDto;

  @ApiProperty()
  totalLiabilitiesAndEquity!: string;

  @ApiProperty({
    description: 'True when totalAssets equals totalLiabilitiesAndEquity',
  })
  balanced!: boolean;
}
