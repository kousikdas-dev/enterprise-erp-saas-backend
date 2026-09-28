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

export class CreatePurchaseDebitNoteItemDto {
  @ApiProperty({ example: 'Price correction on invoice PINV-00000012' })
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
  unitCost!: string;

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

export class CreatePurchaseDebitNoteDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  supplierId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Optional traceability-only reference to a CONFIRMED purchase invoice. Never required — a standalone Debit Note is equally valid.',
  })
  @IsOptional()
  @IsUUID()
  purchaseInvoiceId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  debitNoteDate?: string;

  @ApiPropertyOptional({ example: 'Quality claim on last shipment' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiProperty({ type: [CreatePurchaseDebitNoteItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseDebitNoteItemDto)
  items!: CreatePurchaseDebitNoteItemDto[];
}

export class ReversePurchaseDebitNoteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class PurchaseDebitNoteItemTaxComponentDto {
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

export class PurchaseDebitNoteItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  purchaseDebitNoteId!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  quantity!: string;

  @ApiProperty()
  unitCost!: string;

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

  @ApiProperty({ type: [PurchaseDebitNoteItemTaxComponentDto] })
  taxComponents!: PurchaseDebitNoteItemTaxComponentDto[];
}

export class PurchaseDebitNoteDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  debitNoteNumber!: string;

  @ApiProperty({ format: 'uuid' })
  supplierId!: string;

  @ApiProperty()
  supplierName!: string;

  @ApiPropertyOptional({ nullable: true })
  supplierGstin!: string | null;

  @ApiPropertyOptional({ nullable: true })
  supplierBillingAddress!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  purchaseInvoiceId!: string | null;

  @ApiProperty({ format: 'date' })
  debitNoteDate!: string;

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

  @ApiProperty({ type: [PurchaseDebitNoteItemDto] })
  items!: PurchaseDebitNoteItemDto[];
}

export class PurchaseDebitNoteListDto {
  @ApiProperty({ type: [PurchaseDebitNoteDto] })
  items!: PurchaseDebitNoteDto[];
}
