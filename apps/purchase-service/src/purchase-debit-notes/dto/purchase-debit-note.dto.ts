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
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description!: string;

  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  quantity!: string;

  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  unitCost!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  discountPercent?: string;

  @IsOptional()
  @IsUUID()
  taxCodeId?: string;
}

// Phase 3.13 (Purchase Debit Note) — standalone Accounts Payable adjustment.
// purchaseInvoiceId is deliberately optional: a Debit Note must be valid
// without any PurchaseInvoice/PurchaseReturn/GoodsReceipt reference.
export class CreatePurchaseDebitNoteDto {
  @IsUUID()
  supplierId!: string;

  @IsOptional()
  @IsUUID()
  purchaseInvoiceId?: string;

  @IsOptional()
  @IsISO8601()
  debitNoteDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseDebitNoteItemDto)
  items!: CreatePurchaseDebitNoteItemDto[];
}
