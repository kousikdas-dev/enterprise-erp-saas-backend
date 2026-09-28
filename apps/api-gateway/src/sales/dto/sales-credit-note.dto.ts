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
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateSalesCreditNoteItemDto {
  @ApiProperty({ example: 'Price correction on invoice INV-00000012' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description!: string;

  @ApiProperty({ example: '1' })
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  quantity!: string;

  @ApiProperty({ example: '100.0000' })
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  unitPrice!: string;

  @ApiPropertyOptional({ example: '0' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  discountPercent?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  taxCodeId?: string;
}

export class CreateSalesCreditNoteDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  customerId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Optional traceability-only reference to a SENT sales invoice. Never required — a standalone Credit Note is equally valid.',
  })
  @IsOptional()
  @IsUUID()
  salesInvoiceId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  creditNoteDate?: string;

  @ApiPropertyOptional({ example: 'Commercial discount after invoicing' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiProperty({ type: [CreateSalesCreditNoteItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSalesCreditNoteItemDto)
  items!: CreateSalesCreditNoteItemDto[];
}

export class ReverseSalesCreditNoteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class SalesCreditNoteItemTaxComponentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  sequence!: number;

  @ApiProperty()
  type!: string;

  @ApiPropertyOptional({ nullable: true })
  name!: string | null;

  @ApiProperty()
  rate!: string;

  @ApiProperty()
  componentTaxAmount!: string;
}

export class SalesCreditNoteItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  salesCreditNoteId!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  quantity!: string;

  @ApiProperty()
  unitPrice!: string;

  @ApiProperty()
  discountPercent!: string;

  @ApiProperty()
  discountAmount!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  taxCodeId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  taxCode!: string | null;

  @ApiPropertyOptional({ nullable: true })
  taxCodeName!: string | null;

  @ApiProperty()
  taxAmount!: string;

  @ApiProperty()
  lineSubtotal!: string;

  @ApiProperty()
  lineTotal!: string;

  @ApiProperty({ type: [SalesCreditNoteItemTaxComponentDto] })
  taxComponents!: SalesCreditNoteItemTaxComponentDto[];
}

export class SalesCreditNoteDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  creditNoteNumber!: string;

  @ApiProperty({ format: 'uuid' })
  customerId!: string;

  @ApiProperty()
  customerName!: string;

  @ApiPropertyOptional({ nullable: true })
  customerGstin!: string | null;

  @ApiPropertyOptional({ nullable: true })
  customerBillingAddress!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  salesInvoiceId!: string | null;

  @ApiProperty({ format: 'date' })
  creditNoteDate!: string;

  @ApiPropertyOptional({ nullable: true })
  reason!: string | null;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;

  @ApiProperty()
  subtotal!: string;

  @ApiProperty()
  discountTotal!: string;

  @ApiProperty()
  taxTotal!: string;

  @ApiProperty()
  total!: string;

  @ApiProperty({ enum: ['DRAFT', 'POSTED', 'REVERSED'] })
  status!: string;

  @ApiPropertyOptional({ nullable: true })
  postedAt!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  postedBy!: string | null;

  @ApiPropertyOptional({ nullable: true })
  reversedAt!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  reversedBy!: string | null;

  @ApiPropertyOptional({ nullable: true })
  reversalReason!: string | null;

  @ApiProperty({ enum: ['NOT_POSTED', 'POSTED', 'FAILED', 'REVERSED'] })
  accountingPostingStatus!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  journalEntryId!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  reversalJournalEntryId!: string | null;

  @ApiProperty({ format: 'uuid' })
  createdBy!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;

  @ApiProperty({ type: [SalesCreditNoteItemDto] })
  items!: SalesCreditNoteItemDto[];
}

export class SalesCreditNoteListDto {
  @ApiProperty({ type: [SalesCreditNoteDto] })
  items!: SalesCreditNoteDto[];
}
