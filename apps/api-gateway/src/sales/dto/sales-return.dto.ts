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
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';

export class CreateSalesReturnLineDto {
  // At least one of salesInvoiceItemId/shipmentItemId must be set — enforced
  // by @AtLeastOneReturnReference() below, mirroring sales-service's own
  // identical validator (D13-style defense-in-depth: the gateway is a
  // validating proxy, so this is rejected here too, not only downstream).
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  salesInvoiceItemId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  shipmentItemId?: string;

  @ApiProperty({ example: '5', description: 'Commercial UOM, same unit as whichever reference is set.' })
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  quantity!: string;
}

function AtLeastOneReturnReference(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'atLeastOneReturnReference',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, _args: ValidationArguments) {
          if (!Array.isArray(value)) {
            return true;
          }
          return value.every(
            (line) =>
              line &&
              typeof line === 'object' &&
              ((line as { salesInvoiceItemId?: unknown }).salesInvoiceItemId ||
                (line as { shipmentItemId?: unknown }).shipmentItemId),
          );
        },
        defaultMessage() {
          return 'Each sales return line must reference at least one of salesInvoiceItemId or shipmentItemId';
        },
      },
    });
  };
}

export class CreateSalesReturnDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  salesInvoiceId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiProperty({ type: [CreateSalesReturnLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSalesReturnLineDto)
  @AtLeastOneReturnReference()
  items!: CreateSalesReturnLineDto[];
}

export class ReverseSalesReturnDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class SalesReturnItemDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  salesInvoiceItemId!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  shipmentItemId!: string | null;

  @ApiProperty({ format: 'uuid' })
  productId!: string;

  @ApiProperty()
  productSku!: string;

  @ApiProperty()
  productName!: string;

  @ApiProperty()
  quantity!: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'quantity × conversionFactor — the only value ever sent to Inventory. Null when shipmentItemId is null.',
  })
  baseQuantity!: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Revenue/tax reversal snapshot. Null when salesInvoiceItemId is null.' })
  unitPrice!: string | null;

  @ApiPropertyOptional({ nullable: true })
  discountPercent!: string | null;

  @ApiPropertyOptional({ nullable: true })
  discountAmount!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  taxCodeId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  taxCode!: string | null;

  @ApiPropertyOptional({ nullable: true })
  taxCodeName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  taxAmount!: string | null;

  @ApiPropertyOptional({ nullable: true })
  lineSubtotal!: string | null;

  @ApiPropertyOptional({ nullable: true })
  lineTotal!: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Inventory/COGS reversal snapshot. Null when shipmentItemId is null.' })
  unitCost!: string | null;

  @ApiPropertyOptional({ nullable: true })
  totalCost!: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: "The SALE_RETURN StockMovement this line created — prerequisite for this return's own future reversal.",
  })
  inventoryMovementId!: string | null;
}

export class SalesReturnDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  returnNumber!: string;

  @ApiProperty({ format: 'uuid' })
  salesInvoiceId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  warehouseId!: string | null;

  @ApiProperty({ enum: ['DRAFT', 'CONFIRMED', 'REVERSED'] })
  status!: string;

  @ApiPropertyOptional({ nullable: true })
  reason!: string | null;

  @ApiPropertyOptional({ nullable: true })
  returnedAt!: string | null;

  @ApiProperty({ enum: ['NOT_POSTED', 'POSTED', 'FAILED', 'REVERSED'] })
  accountingPostingStatus!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  journalEntryId!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  reversalJournalEntryId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  reversedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  reversalReason!: string | null;

  @ApiProperty({ type: [SalesReturnItemDto] })
  items!: SalesReturnItemDto[];
}

export class SalesReturnListDto {
  @ApiProperty({ type: [SalesReturnDto] })
  items!: SalesReturnDto[];
}
