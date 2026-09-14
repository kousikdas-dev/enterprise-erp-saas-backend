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

export class CreatePurchaseOrderItemDto {
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

  @ApiProperty({ example: '5.0000' })
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  unitCost!: string;

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

export class CreatePurchaseOrderDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  supplierId!: string;

  @ApiPropertyOptional({ example: 'Supplier quote #Q-1234' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  supplierReference?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsISO8601()
  expectedDeliveryDate?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Identity user reference — not a Master Data entity.',
  })
  @IsOptional()
  @IsUUID()
  buyerId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Overrides the supplier default payment term when supplied.',
  })
  @IsOptional()
  @IsUUID()
  paymentTermId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Optional/default receiving warehouse for this order.',
  })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiProperty({ type: [CreatePurchaseOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderItemDto)
  items!: CreatePurchaseOrderItemDto[];
}

export class UpdatePurchaseOrderDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ example: 'Supplier quote #Q-1234' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  supplierReference?: string;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  @IsOptional()
  @IsISO8601()
  expectedDeliveryDate?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  buyerId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  paymentTermId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  warehouseId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ type: [CreatePurchaseOrderItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderItemDto)
  items?: CreatePurchaseOrderItemDto[];
}

export class PurchaseOrderItemTaxComponentDto {
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

export class PurchaseOrderItemDto {
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

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  unitOfMeasureId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  uomCode!: string | null;

  @ApiPropertyOptional({ nullable: true })
  uomName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  conversionFactor!: string | null;

  @ApiProperty()
  unitCost!: string;

  @ApiProperty()
  discountPercent!: string;

  @ApiProperty()
  discountAmount!: string;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
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

  @ApiProperty()
  receivedQuantity!: string;

  @ApiProperty({ type: [PurchaseOrderItemTaxComponentDto] })
  taxComponents!: PurchaseOrderItemTaxComponentDto[];
}

export class PurchaseOrderDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty({ example: 'PO-00000001' })
  poNumber!: string;

  @ApiProperty()
  supplierId!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  supplierName!: string;

  @ApiPropertyOptional({ nullable: true })
  supplierGstin!: string | null;

  @ApiPropertyOptional({ nullable: true })
  supplierBillingAddress!: string | null;

  @ApiPropertyOptional({ nullable: true })
  supplierDispatchAddress!: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  paymentTermId!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    format: 'uuid',
    description: 'Identity user reference — not a Master Data entity.',
  })
  buyerId!: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  warehouseId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  supplierReference!: string | null;

  @ApiPropertyOptional({ nullable: true })
  expectedDeliveryDate!: Date | string | null;

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

  @ApiProperty({ type: [PurchaseOrderItemDto] })
  items!: PurchaseOrderItemDto[];
}

export class PurchaseOrderListDto {
  @ApiProperty({ type: [PurchaseOrderDto] })
  items!: PurchaseOrderDto[];
}
