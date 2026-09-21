import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CreateSalesInvoiceItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ example: 'SKU-1' })
  @IsString()
  @MaxLength(64)
  productSku!: string;

  @ApiProperty({ example: 'Widget' })
  @IsString()
  @MaxLength(160)
  productName!: string;

  @ApiProperty({ example: '10' })
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  quantity!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  unitOfMeasureId!: string;

  @ApiProperty({ example: '25.0000' })
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  unitPrice!: string;

  @ApiPropertyOptional({ example: '10.00' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  discountPercent?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  taxCodeId?: string;
}

export class CreateSalesInvoiceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  customerId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  invoiceDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  billingAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  shippingAddress?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  paymentTermId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  salespersonId?: string;

  @ApiProperty({ type: [CreateSalesInvoiceItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSalesInvoiceItemDto)
  items!: CreateSalesInvoiceItemDto[];
}

export class UpdateSalesInvoiceDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  invoiceDate?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsISO8601()
  dueDate?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  billingAddress?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  shippingAddress?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  paymentTermId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  salespersonId?: string | null;

  @ApiPropertyOptional({ type: [CreateSalesInvoiceItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSalesInvoiceItemDto)
  items?: CreateSalesInvoiceItemDto[];
}

/** Optional overrides accepted by the /sales-orders/:id/invoice and /proforma-invoices/:id/invoice conversion routes. */
export class CreateInvoiceFromSourceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  invoiceDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class SalesInvoiceItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  productId!: string;

  @ApiProperty()
  productSku!: string;

  @ApiProperty()
  productName!: string;

  @ApiProperty()
  quantity!: string;

  @ApiProperty()
  unitPrice!: string;

  @ApiProperty()
  lineTotal!: string;
}

export class SalesInvoiceDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  invoiceNumber!: string;

  @ApiPropertyOptional({ nullable: true })
  sourceType!: string | null;

  @ApiPropertyOptional({ nullable: true })
  sourceId!: string | null;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  customerId!: string;

  @ApiProperty()
  customerName!: string;

  @ApiPropertyOptional({ nullable: true })
  billingAddress!: string | null;

  @ApiPropertyOptional({ nullable: true })
  shippingAddress!: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  paymentTermId!: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  salespersonId!: string | null;

  @ApiProperty()
  invoiceDate!: string;

  @ApiPropertyOptional({ nullable: true })
  dueDate!: string | null;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;

  @ApiProperty()
  subtotal!: string;

  @ApiProperty()
  total!: string;

  @ApiProperty()
  amountPaid!: string;

  @ApiProperty()
  balanceDue!: string;

  @ApiProperty({ enum: ['UNPAID', 'PARTIALLY_PAID', 'PAID'] })
  paymentStatus!: string;

  @ApiPropertyOptional({ nullable: true })
  sentAt!: string | null;

  @ApiProperty({
    enum: ['NOT_POSTED', 'POSTED', 'FAILED', 'REVERSED'],
    description:
      'Accounting journal posting state for this invoice. NOT_POSTED before send(); POSTED once the journal is posted; FAILED if posting (or reversal) failed and can be retried; REVERSED once a cancelled, previously-posted invoice has had its journal reversed.',
  })
  accountingPostingStatus!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  journalEntryId!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  reversalJournalEntryId!: string | null;

  @ApiProperty({ type: [SalesInvoiceItemDto] })
  items!: SalesInvoiceItemDto[];
}

export class SalesInvoiceListDto {
  @ApiProperty({ type: [SalesInvoiceDto] })
  items!: SalesInvoiceDto[];
}

export class CreateSalesPaymentDto {
  @ApiProperty({ example: '500.0000' })
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  amount!: string;

  @ApiProperty()
  @IsISO8601()
  paymentDate!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class SalesPaymentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  salesInvoiceId!: string;

  @ApiProperty()
  amount!: string;

  @ApiProperty()
  paymentDate!: string;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  paymentMethodId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  reference!: string | null;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class SalesPaymentListDto {
  @ApiProperty({ type: [SalesPaymentDto] })
  items!: SalesPaymentDto[];
}

export class RecordSalesPaymentResultDto {
  @ApiProperty({ type: SalesPaymentDto })
  payment!: SalesPaymentDto;

  @ApiProperty({ type: SalesInvoiceDto })
  invoice!: SalesInvoiceDto;
}
