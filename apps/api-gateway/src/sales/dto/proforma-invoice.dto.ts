import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
