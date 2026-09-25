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

export class ApSupplierListQueryDto {
  @ApiPropertyOptional({
    description: 'Defaults to true — only suppliers with a positive outstanding balance.',
  })
  @IsOptional()
  @IsBooleanString()
  onlyOutstanding?: string;
}

export class ApInvoiceListQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ enum: ['DRAFT', 'CONFIRMED', 'CANCELLED'], default: 'CONFIRMED' })
  @IsOptional()
  @IsIn(['DRAFT', 'CONFIRMED', 'CANCELLED'])
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

export class ApAgingQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD, defaults to today (UTC).' })
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'asOfDate must be in YYYY-MM-DD format' })
  asOfDate?: string;
}

export class ApStatementQueryDto {
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

export class SupplierApSummaryDto {
  @ApiProperty() supplierId!: string;
  @ApiProperty() supplierCode!: string;
  @ApiProperty() supplierName!: string;
  @ApiProperty() totalInvoiced!: string;
  @ApiProperty() totalPaid!: string;
  @ApiProperty() totalOutstanding!: string;
  @ApiProperty() outstandingInvoiceCount!: number;
}

export class SupplierApSummaryListDto {
  @ApiProperty({ type: [SupplierApSummaryDto] })
  items!: SupplierApSummaryDto[];
}

export class SupplierApLedgerPaymentSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() amount!: string;
  @ApiProperty() paymentDate!: string;
  @ApiProperty({ enum: ['ACTIVE', 'REVERSED'] }) status!: string;
  @ApiPropertyOptional({ nullable: true }) reversedAt!: string | null;
}

export class SupplierApLedgerItemDto {
  @ApiProperty() invoiceId!: string;
  @ApiProperty() invoiceNumber!: string;
  @ApiPropertyOptional({ nullable: true }) supplierInvoiceNumber!: string | null;
  @ApiProperty() supplierId!: string;
  @ApiProperty() supplierName!: string;
  @ApiProperty() invoiceDate!: string;
  @ApiPropertyOptional({ nullable: true }) dueDate!: string | null;
  @ApiProperty() total!: string;
  @ApiProperty() amountPaid!: string;
  @ApiProperty() balanceDue!: string;
  @ApiProperty({ enum: ['UNPAID', 'PARTIALLY_PAID', 'PAID'] }) paymentStatus!: string;
  @ApiProperty({ enum: ['DRAFT', 'CONFIRMED', 'CANCELLED'] }) status!: string;
  @ApiPropertyOptional({ type: [SupplierApLedgerPaymentSummaryDto] })
  payments?: SupplierApLedgerPaymentSummaryDto[];
}

export class SupplierApLedgerListDto {
  @ApiProperty({ type: [SupplierApLedgerItemDto] })
  items!: SupplierApLedgerItemDto[];
}

export class ApAgingRowDto {
  @ApiProperty() invoiceId!: string;
  @ApiProperty() invoiceNumber!: string;
  @ApiProperty() supplierId!: string;
  @ApiProperty() supplierName!: string;
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

export class ApAgingResultDto {
  @ApiProperty() asOfDate!: string;
  @ApiProperty({ type: [ApAgingRowDto] }) items!: ApAgingRowDto[];
  @ApiProperty({ type: Object }) totalsByBucket!: Record<string, string>;
}

export class SupplierApStatementLineDto {
  @ApiProperty() date!: string;
  @ApiProperty({ enum: ['INVOICE', 'PAYMENT', 'PAYMENT_REVERSAL'] }) type!: string;
  @ApiProperty() reference!: string;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiProperty() amount!: string;
  @ApiProperty() runningBalance!: string;
}

export class SupplierApStatementDto {
  @ApiProperty() supplierId!: string;
  @ApiProperty() supplierName!: string;
  @ApiPropertyOptional({ nullable: true }) fromDate!: string | null;
  @ApiPropertyOptional({ nullable: true }) toDate!: string | null;
  @ApiProperty() openingBalance!: string;
  @ApiProperty() closingBalance!: string;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty({ type: [SupplierApStatementLineDto] }) items!: SupplierApStatementLineDto[];
}

export class ApReconciliationSummaryDto {
  @ApiProperty() subledgerTotalOutstanding!: string;
  @ApiPropertyOptional({ nullable: true, format: 'uuid' }) glAccountId!: string | null;
  @ApiPropertyOptional({ nullable: true }) glAccountsPayableBalance!: string | null;
  @ApiPropertyOptional({ nullable: true }) difference!: string | null;
  @ApiProperty() matches!: boolean;
}
