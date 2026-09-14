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

  @IsUUID()
  unitOfMeasureId!: string;

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

export class CreatePurchaseOrderDto {
  @IsUUID()
  supplierId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  supplierReference?: string;

  @IsOptional()
  @IsISO8601()
  expectedDeliveryDate?: string;

  // Identity user reference — not a Master Data entity. Format-only
  // validation, no synchronous existence-check HTTP call, matching the
  // repo-wide soft-reference convention (mirrors SalesOrder.salespersonId).
  @IsOptional()
  @IsUUID()
  buyerId?: string;

  // Overrides the supplier's default payment term when supplied; otherwise
  // defaults from the selected supplier (mirrors SalesOrder.paymentTermId).
  @IsOptional()
  @IsUUID()
  paymentTermId?: string;

  // Optional/default receiving warehouse — informational only. The
  // operational destination for stock remains GoodsReceipt.warehouseId.
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderItemDto)
  items!: CreatePurchaseOrderItemDto[];
}

export class UpdatePurchaseOrderDto {
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  supplierReference?: string;

  @IsOptional()
  @IsISO8601()
  expectedDeliveryDate?: string | null;

  @IsOptional()
  @IsUUID()
  buyerId?: string | null;

  @IsOptional()
  @IsUUID()
  paymentTermId?: string | null;

  @IsOptional()
  @IsUUID()
  warehouseId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderItemDto)
  items?: CreatePurchaseOrderItemDto[];
}
