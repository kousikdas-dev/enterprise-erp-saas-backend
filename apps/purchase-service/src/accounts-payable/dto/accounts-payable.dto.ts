import {
  IsBooleanString,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

// Deliberately stricter than a generic @IsISO8601() — only an unambiguous
// UTC calendar-day date is accepted, mirroring AccountLedgerQueryDto.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class ApSupplierListQueryDto {
  @IsOptional()
  @IsBooleanString()
  onlyOutstanding?: string;
}

export class ApInvoiceListQueryDto {
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'CONFIRMED', 'CANCELLED'])
  status?: 'DRAFT' | 'CONFIRMED' | 'CANCELLED';

  @IsOptional()
  @IsIn(['UNPAID', 'PARTIALLY_PAID', 'PAID'])
  paymentStatus?: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';

  @IsOptional()
  @IsBooleanString()
  includePayments?: string;
}

export class ApAgingQueryDto {
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @Matches(DATE_ONLY, { message: 'asOfDate must be in YYYY-MM-DD format' })
  asOfDate?: string;
}

export class ApStatementQueryDto {
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
