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

export class CreateQuotationItemDto {
  @IsUUID()
  productId!: string;

  @IsString()
  @MaxLength(64)
  productSku!: string;

  @IsString()
  @MaxLength(160)
  productName!: string;

  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  quantity!: string;

  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  unitPrice!: string;
}

export class CreateQuotationDto {
  @IsUUID()
  customerId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsISO8601()
  validUntil?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  billingAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  shippingAddress?: string;

  @IsOptional()
  @IsUUID()
  paymentTermId?: string;

  @IsOptional()
  @IsUUID()
  salespersonId?: string;

  @IsOptional()
  @IsISO8601()
  deliveryDate?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateQuotationItemDto)
  items!: CreateQuotationItemDto[];
}

export class UpdateQuotationDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsISO8601()
  validUntil?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  billingAddress?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  shippingAddress?: string | null;

  @IsOptional()
  @IsUUID()
  paymentTermId?: string | null;

  @IsOptional()
  @IsUUID()
  salespersonId?: string | null;

  @IsOptional()
  @IsISO8601()
  deliveryDate?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateQuotationItemDto)
  items?: CreateQuotationItemDto[];
}
