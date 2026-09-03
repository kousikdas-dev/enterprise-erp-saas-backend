import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class UpdateProformaInvoiceItemDto {
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

export class UpdateProformaInvoiceDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;

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

  @ApiPropertyOptional({ type: [UpdateProformaInvoiceItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateProformaInvoiceItemDto)
  items?: UpdateProformaInvoiceItemDto[];
}

export class ProformaInvoiceItemDto {
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

export class ProformaInvoiceDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  documentNumber!: string;

  @ApiProperty()
  sourceType!: string;

  @ApiProperty()
  sourceId!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  customerId!: string;

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

  @ApiProperty({ type: [ProformaInvoiceItemDto] })
  items!: ProformaInvoiceItemDto[];
}

export class ProformaInvoiceListDto {
  @ApiProperty({ type: [ProformaInvoiceDto] })
  items!: ProformaInvoiceDto[];
}
