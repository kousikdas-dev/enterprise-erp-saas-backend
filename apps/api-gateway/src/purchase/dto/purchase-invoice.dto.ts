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

export class CreatePurchaseInvoiceItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  purchaseOrderItemId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  goodsReceiptItemId?: string;

  @ApiProperty({ example: '5' })
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  quantity!: string;

  @ApiProperty({ example: '10.0000' })
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  unitCost!: string;

  @ApiPropertyOptional({ example: '0' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  discountPercent?: string;
}

export class CreatePurchaseInvoiceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  purchaseOrderId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  supplierInvoiceNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  invoiceDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiProperty({ type: [CreatePurchaseInvoiceItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseInvoiceItemDto)
  items!: CreatePurchaseInvoiceItemDto[];
}

export class UpdatePurchaseInvoiceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  supplierInvoiceNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  invoiceDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ type: [CreatePurchaseInvoiceItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseInvoiceItemDto)
  items?: CreatePurchaseInvoiceItemDto[];
}

export class PurchaseInvoiceItemTaxComponentDto {
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

export class PurchaseInvoiceItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  purchaseInvoiceId!: string;

  @ApiProperty()
  purchaseOrderItemId!: string;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  goodsReceiptItemId!: string | null;

  @ApiProperty({ format: 'uuid' })
  productId!: string;

  @ApiProperty()
  productSku!: string;

  @ApiProperty()
  productName!: string;

  @ApiPropertyOptional({ nullable: true })
  unitOfMeasureId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  uomCode!: string | null;

  @ApiPropertyOptional({ nullable: true })
  uomName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  conversionFactor!: string | null;

  @ApiProperty()
  quantity!: string;

  @ApiProperty()
  unitCost!: string;

  @ApiProperty()
  discountPercent!: string;

  @ApiProperty()
  discountAmount!: string;

  @ApiPropertyOptional({ nullable: true })
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

  @ApiProperty({ type: [PurchaseInvoiceItemTaxComponentDto] })
  taxComponents!: PurchaseInvoiceItemTaxComponentDto[];

  @ApiProperty({
    description:
      'Three-way matching (flag-only, zero tolerance): true if this line\'s unitCost differs from the referenced purchase order line.',
  })
  costMismatch!: boolean;

  @ApiProperty({
    description:
      'Three-way matching (flag-only, zero tolerance): true if this line\'s discountPercent differs from the referenced purchase order line.',
  })
  discountMismatch!: boolean;

  @ApiProperty({
    description:
      'Three-way matching (flag-only, zero tolerance): true if this line\'s taxCodeId differs from the referenced purchase order line.',
  })
  taxMismatch!: boolean;
}

export class PurchaseInvoiceDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  invoiceNumber!: string;

  @ApiPropertyOptional({ nullable: true })
  supplierInvoiceNumber!: string | null;

  @ApiProperty()
  purchaseOrderId!: string;

  @ApiProperty({ enum: ['DRAFT', 'CONFIRMED', 'CANCELLED'] })
  status!: string;

  @ApiProperty()
  supplierId!: string;

  @ApiProperty()
  supplierName!: string;

  @ApiPropertyOptional({ nullable: true })
  supplierGstin!: string | null;

  @ApiPropertyOptional({ nullable: true })
  supplierBillingAddress!: string | null;

  @ApiPropertyOptional({ nullable: true })
  paymentTermId!: string | null;

  @ApiProperty()
  invoiceDate!: Date;

  @ApiPropertyOptional({ nullable: true })
  dueDate!: Date | null;

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

  @ApiProperty()
  amountPaid!: string;

  @ApiProperty()
  balanceDue!: string;

  @ApiProperty({ enum: ['UNPAID', 'PARTIALLY_PAID', 'PAID'] })
  paymentStatus!: string;

  @ApiPropertyOptional({ nullable: true })
  confirmedAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty({ type: [PurchaseInvoiceItemDto] })
  items!: PurchaseInvoiceItemDto[];
}

export class PurchaseInvoiceListDto {
  @ApiProperty({ type: [PurchaseInvoiceDto] })
  items!: PurchaseInvoiceDto[];
}

export class CreateSupplierPaymentDto {
  @ApiProperty({ example: '500.0000' })
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  amount!: string;

  @ApiProperty()
  @IsISO8601()
  paymentDate!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class SupplierPaymentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  purchaseInvoiceId!: string;

  @ApiProperty()
  amount!: string;

  @ApiProperty()
  paymentDate!: string;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  paymentMethodId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  reference!: string | null;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class SupplierPaymentListDto {
  @ApiProperty({ type: [SupplierPaymentDto] })
  items!: SupplierPaymentDto[];
}

export class RecordSupplierPaymentResultDto {
  @ApiProperty({ type: SupplierPaymentDto })
  payment!: SupplierPaymentDto;

  @ApiProperty({ type: PurchaseInvoiceDto })
  invoice!: PurchaseInvoiceDto;
}
