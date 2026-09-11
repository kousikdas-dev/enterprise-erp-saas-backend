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

export class CreateSalesOrderItemDto {
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

export class CreateSalesOrderDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  deliveryDate?: string;

  @ApiProperty({ type: [CreateSalesOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSalesOrderItemDto)
  items!: CreateSalesOrderItemDto[];
}

export class UpdateSalesOrderDto {
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

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsISO8601()
  deliveryDate?: string | null;

  @ApiPropertyOptional({ type: [CreateSalesOrderItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSalesOrderItemDto)
  items?: CreateSalesOrderItemDto[];
}

export class SalesOrderItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  productId!: string;

  @ApiProperty()
  productSku!: string;

  @ApiProperty()
  productName!: string;

  @ApiProperty()
  orderedQuantity!: string;

  @ApiProperty()
  shippedQuantity!: string;

  @ApiProperty()
  remainingQuantity!: string;

  @ApiProperty()
  unitPrice!: string;

  @ApiProperty()
  lineTotal!: string;
}

export class SalesOrderDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  customerId!: string;

  @ApiPropertyOptional({ nullable: true })
  quotationId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  proformaInvoiceId!: string | null;

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

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  paymentTermId!: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  salespersonId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  deliveryDate!: string | null;

  @ApiProperty()
  subtotal!: string;

  @ApiProperty()
  total!: string;

  @ApiProperty({ type: [SalesOrderItemDto] })
  items!: SalesOrderItemDto[];
}

export class SalesOrderListDto {
  @ApiProperty({ type: [SalesOrderDto] })
  items!: SalesOrderDto[];
}
