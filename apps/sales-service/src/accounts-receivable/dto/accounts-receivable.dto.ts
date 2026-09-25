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
// UTC calendar-day date is accepted, mirroring AccountLedgerQueryDto /
// purchase-service's ApStatementQueryDto.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class ArCustomerListQueryDto {
  @IsOptional()
  @IsBooleanString()
  onlyOutstanding?: string;
}

export class ArInvoiceListQueryDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'SENT', 'CANCELLED'])
  status?: 'DRAFT' | 'SENT' | 'CANCELLED';

  @IsOptional()
  @IsIn(['UNPAID', 'PARTIALLY_PAID', 'PAID'])
  paymentStatus?: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';

  @IsOptional()
  @IsBooleanString()
  includePayments?: string;
}

export class ArAgingQueryDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @Matches(DATE_ONLY, { message: 'asOfDate must be in YYYY-MM-DD format' })
  asOfDate?: string;
}

export class ArStatementQueryDto {
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
