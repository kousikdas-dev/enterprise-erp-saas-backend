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
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description!: string;

  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  quantity!: string;

  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  unitPrice!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  discountPercent?: string;

  @IsOptional()
  @IsUUID()
  taxCodeId?: string;
}

// Phase 3.14 (Standalone Sales Credit Note) — standalone Accounts Receivable
// adjustment. salesInvoiceId is deliberately optional: a Credit Note must be
// valid without any SalesReturn/Shipment/ShipmentItem/inventory reference.
export class CreateSalesCreditNoteDto {
  @IsUUID()
  customerId!: string;

  @IsOptional()
  @IsUUID()
  salesInvoiceId?: string;

  @IsOptional()
  @IsISO8601()
  creditNoteDate?: string;

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
  @Type(() => CreateSalesCreditNoteItemDto)
  items!: CreateSalesCreditNoteItemDto[];
}
