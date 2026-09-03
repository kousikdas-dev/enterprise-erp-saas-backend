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

export class CreateSalesInvoiceItemDto {
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

export class CreateSalesInvoiceDto {
  @IsUUID()
  customerId!: string;

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

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSalesInvoiceItemDto)
  items!: CreateSalesInvoiceItemDto[];
}

export class UpdateSalesInvoiceDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsISO8601()
  invoiceDate?: string;

  @IsOptional()
  @IsISO8601()
  dueDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;

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
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSalesInvoiceItemDto)
  items?: CreateSalesInvoiceItemDto[];
}

/** Optional overrides accepted by the /sales-orders/:id/invoice and /proforma-invoices/:id/invoice conversion routes. */
export class CreateInvoiceFromSourceDto {
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
}
