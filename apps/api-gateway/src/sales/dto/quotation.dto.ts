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

export class CreateQuotationItemDto {
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

  @ApiProperty({ example: '25.0000' })
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  unitPrice!: string;
}

export class CreateQuotationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  customerId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  validUntil?: string;

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

  @ApiProperty({ type: [CreateQuotationItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateQuotationItemDto)
  items!: CreateQuotationItemDto[];
}

export class UpdateQuotationDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsISO8601()
  validUntil?: string | null;

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

  @ApiPropertyOptional({ type: [CreateQuotationItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateQuotationItemDto)
  items?: CreateQuotationItemDto[];
}

export class QuotationItemDto {
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

export class QuotationDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  customerId!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  customerName!: string;

  @ApiPropertyOptional({ nullable: true })
  billingAddress!: string | null;

  @ApiPropertyOptional({ nullable: true })
  shippingAddress!: string | null;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;

  @ApiProperty()
  subtotal!: string;

  @ApiProperty()
  total!: string;

  @ApiProperty({ type: [QuotationItemDto] })
  items!: QuotationItemDto[];
}

export class QuotationListDto {
  @ApiProperty({ type: [QuotationDto] })
  items!: QuotationDto[];
}
