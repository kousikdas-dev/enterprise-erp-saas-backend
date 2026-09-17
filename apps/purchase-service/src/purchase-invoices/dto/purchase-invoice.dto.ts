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

export class CreatePurchaseInvoiceItemDto {
  @IsUUID()
  purchaseOrderItemId!: string;

  @IsOptional()
  @IsUUID()
  goodsReceiptItemId?: string;

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
}

export class CreatePurchaseInvoiceDto {
  @IsUUID()
  purchaseOrderId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  supplierInvoiceNumber?: string;

  @IsOptional()
  @IsISO8601()
  invoiceDate?: string;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseInvoiceItemDto)
  items!: CreatePurchaseInvoiceItemDto[];
}

export class UpdatePurchaseInvoiceDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  supplierInvoiceNumber?: string;

  @IsOptional()
  @IsISO8601()
  invoiceDate?: string;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseInvoiceItemDto)
  items?: CreatePurchaseInvoiceItemDto[];
}

// Supplier Payment V1 (Section 22.9) — mirrors CreateSalesPaymentDto
// (apps/sales-service/src/sales-invoices/dto/sales-invoice.dto.ts) exactly.
export class CreateSupplierPaymentDto {
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  amount!: string;

  @IsISO8601()
  paymentDate!: string;

  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
