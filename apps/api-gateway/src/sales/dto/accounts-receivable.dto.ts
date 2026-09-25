import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class ArCustomerListQueryDto {
  @ApiPropertyOptional({
    description: 'Defaults to true — only customers with a positive outstanding balance.',
  })
  @IsOptional()
  @IsBooleanString()
  onlyOutstanding?: string;
}

export class ArInvoiceListQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ enum: ['DRAFT', 'SENT', 'CANCELLED'], default: 'SENT' })
  @IsOptional()
  @IsIn(['DRAFT', 'SENT', 'CANCELLED'])
  status?: string;

  @ApiPropertyOptional({ enum: ['UNPAID', 'PARTIALLY_PAID', 'PAID'] })
  @IsOptional()
  @IsIn(['UNPAID', 'PARTIALLY_PAID', 'PAID'])
  paymentStatus?: string;

  @ApiPropertyOptional({ description: 'Include each invoice\'s payment history in the response.' })
  @IsOptional()
  @IsBooleanString()
  includePayments?: string;
}

export class ArAgingQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD, defaults to today (UTC).' })
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'asOfDate must be in YYYY-MM-DD format' })
  asOfDate?: string;
}

export class ArStatementQueryDto {
  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'fromDate must be in YYYY-MM-DD format' })
  fromDate?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'toDate must be in YYYY-MM-DD format' })
  toDate?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class CustomerArSummaryDto {
  @ApiProperty() customerId!: string;
  @ApiProperty() customerCode!: string;
  @ApiProperty() customerName!: string;
  @ApiProperty() totalInvoiced!: string;
  @ApiProperty() totalPaid!: string;
  @ApiProperty() totalOutstanding!: string;
  @ApiProperty() outstandingInvoiceCount!: number;
}

export class CustomerArSummaryListDto {
  @ApiProperty({ type: [CustomerArSummaryDto] })
  items!: CustomerArSummaryDto[];
}

export class CustomerArLedgerPaymentSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() amount!: string;
  @ApiProperty() paymentDate!: string;
}

export class CustomerArLedgerItemDto {
  @ApiProperty() invoiceId!: string;
  @ApiProperty() invoiceNumber!: string;
  @ApiProperty() customerId!: string;
  @ApiProperty() customerName!: string;
  @ApiProperty() invoiceDate!: string;
  @ApiPropertyOptional({ nullable: true }) dueDate!: string | null;
  @ApiProperty() total!: string;
  @ApiProperty() amountPaid!: string;
  @ApiProperty() balanceDue!: string;
  @ApiProperty({ enum: ['UNPAID', 'PARTIALLY_PAID', 'PAID'] }) paymentStatus!: string;
  @ApiProperty({ enum: ['DRAFT', 'SENT', 'CANCELLED'] }) status!: string;
  @ApiPropertyOptional({ type: [CustomerArLedgerPaymentSummaryDto] })
  payments?: CustomerArLedgerPaymentSummaryDto[];
}

export class CustomerArLedgerListDto {
  @ApiProperty({ type: [CustomerArLedgerItemDto] })
  items!: CustomerArLedgerItemDto[];
}

export class ArAgingRowDto {
  @ApiProperty() invoiceId!: string;
  @ApiProperty() invoiceNumber!: string;
  @ApiProperty() customerId!: string;
  @ApiProperty() customerName!: string;
  @ApiProperty() invoiceDate!: string;
  @ApiPropertyOptional({ nullable: true }) dueDate!: string | null;
  @ApiProperty() effectiveDueDate!: string;
  @ApiProperty({
    enum: ['DUE_DATE', 'PAYMENT_TERM_DERIVED', 'INVOICE_DATE_FALLBACK'],
    description:
      'How effectiveDueDate was derived. PAYMENT_TERM_DERIVED is reserved but currently unreachable — PaymentTerm has no day-count field in this schema.',
  })
  agingBasis!: string;
  @ApiProperty() balanceDue!: string;
  @ApiProperty() daysOverdue!: number;
  @ApiProperty({ enum: ['CURRENT', 'DAYS_1_30', 'DAYS_31_60', 'DAYS_61_90', 'DAYS_90_PLUS'] })
  bucket!: string;
}

export class ArAgingResultDto {
  @ApiProperty() asOfDate!: string;
  @ApiProperty({ type: [ArAgingRowDto] }) items!: ArAgingRowDto[];
  @ApiProperty({ type: Object }) totalsByBucket!: Record<string, string>;
}

export class CustomerArStatementLineDto {
  @ApiProperty() date!: string;
  @ApiProperty({
    enum: ['INVOICE', 'PAYMENT'],
    description:
      'No PAYMENT_REVERSAL type — Sales Payment has no reversal lifecycle in this phase, unlike Supplier Payment.',
  })
  type!: string;
  @ApiProperty() reference!: string;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiProperty() amount!: string;
  @ApiProperty() runningBalance!: string;
}

export class CustomerArStatementDto {
  @ApiProperty() customerId!: string;
  @ApiProperty() customerName!: string;
  @ApiPropertyOptional({ nullable: true }) fromDate!: string | null;
  @ApiPropertyOptional({ nullable: true }) toDate!: string | null;
  @ApiProperty() openingBalance!: string;
  @ApiProperty() closingBalance!: string;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty({ type: [CustomerArStatementLineDto] }) items!: CustomerArStatementLineDto[];
}

export class ArReconciliationSummaryDto {
  @ApiProperty() subledgerTotalOutstanding!: string;
  @ApiPropertyOptional({ nullable: true, format: 'uuid' }) glAccountId!: string | null;
  @ApiPropertyOptional({ nullable: true }) glAccountsReceivableBalance!: string | null;
  @ApiPropertyOptional({ nullable: true }) difference!: string | null;
  @ApiProperty() matches!: boolean;
}
