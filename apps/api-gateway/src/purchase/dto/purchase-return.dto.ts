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

export class CreatePurchaseReturnLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  goodsReceiptItemId!: string;

  @ApiProperty({ example: '5', description: 'Commercial UOM, same unit as the referenced goods receipt line.' })
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  quantity!: string;
}

// Mirrors purchase-service's identical validator (PurchaseReturnsService's
// own D13-style defense-in-depth) — the gateway is a validating proxy, so a
// duplicate line is rejected here too rather than only downstream.
function NoDuplicateGoodsReceiptItems(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'noDuplicateGoodsReceiptItems',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, _args: ValidationArguments) {
          if (!Array.isArray(value)) {
            return true;
          }
          const ids = value
            .map((line) =>
              line && typeof line === 'object'
                ? (line as { goodsReceiptItemId?: unknown }).goodsReceiptItemId
                : undefined,
            )
            .filter((id): id is string => typeof id === 'string');
          return new Set(ids).size === ids.length;
        },
        defaultMessage() {
          return 'Duplicate goodsReceiptItemId values are not allowed within one purchase return';
        },
      },
    });
  };
}

export class CreatePurchaseReturnDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  goodsReceiptId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiProperty({ type: [CreatePurchaseReturnLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseReturnLineDto)
  @NoDuplicateGoodsReceiptItems()
  items!: CreatePurchaseReturnLineDto[];
}

export class ReversePurchaseReturnDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class PurchaseReturnAllocationDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ['UNMATCHED_RECEIPT', 'MATCHED_INVOICE'] })
  allocationType!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  purchaseInvoiceItemId!: string | null;

  @ApiProperty()
  baseQuantity!: string;

  @ApiProperty()
  receiptUnitCost!: string;

  @ApiProperty()
  receiptCostAmount!: string;

  @ApiPropertyOptional({ nullable: true })
  invoiceUnitCost!: string | null;

  @ApiPropertyOptional({ nullable: true })
  invoiceCostAmount!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Signed: invoiceCostAmount - receiptCostAmount. Only set for MATCHED_INVOICE allocations.',
  })
  ppvAmount!: string | null;
}

export class PurchaseReturnItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  goodsReceiptItemId!: string;

  @ApiProperty({ format: 'uuid' })
  productId!: string;

  @ApiProperty()
  productSku!: string;

  @ApiProperty()
  productName!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  unitOfMeasureId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  uomCode!: string | null;

  @ApiPropertyOptional({ nullable: true })
  uomName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  conversionFactor!: string | null;

  @ApiProperty()
  quantity!: string;

  @ApiProperty({
    description: 'quantity × conversionFactor, computed once at creation. The only value ever sent to Inventory.',
  })
  baseQuantity!: string;

  @ApiProperty({ type: [PurchaseReturnAllocationDto] })
  allocations!: PurchaseReturnAllocationDto[];
}

export class PurchaseReturnDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  returnNumber!: string;

  @ApiProperty()
  goodsReceiptId!: string;

  @ApiProperty()
  warehouseId!: string;

  @ApiProperty({ enum: ['DRAFT', 'CONFIRMED', 'REVERSED'] })
  status!: string;

  @ApiPropertyOptional({ nullable: true })
  reason!: string | null;

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

  @ApiProperty({ type: [PurchaseReturnItemDto] })
  items!: PurchaseReturnItemDto[];
}

export class PurchaseReturnListDto {
  @ApiProperty({ type: [PurchaseReturnDto] })
  items!: PurchaseReturnDto[];
}
