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

export class CreateGoodsReceiptLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  purchaseOrderItemId!: string;

  @ApiProperty({ example: '5' })
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  quantity!: string;
}

// Mirrors purchase-service's identical validator (goods-receipts.service's
// D13 requirement) — the gateway is a validating proxy, so a duplicate line
// is rejected here too rather than only downstream.
function NoDuplicatePurchaseOrderItems(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'noDuplicatePurchaseOrderItems',
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
                ? (line as { purchaseOrderItemId?: unknown })
                    .purchaseOrderItemId
                : undefined,
            )
            .filter((id): id is string => typeof id === 'string');
          return new Set(ids).size === ids.length;
        },
        defaultMessage() {
          return 'Duplicate purchaseOrderItemId values are not allowed within one goods receipt';
        },
      },
    });
  };
}

export class CreateGoodsReceiptDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  purchaseOrderId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  warehouseId!: string;

  @ApiProperty({ type: [CreateGoodsReceiptLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateGoodsReceiptLineDto)
  @NoDuplicatePurchaseOrderItems()
  items!: CreateGoodsReceiptLineDto[];
}

export class ReverseGoodsReceiptDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class GoodsReceiptItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  purchaseOrderItemId!: string;

  @ApiProperty()
  quantity!: string;

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

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Historical conversion factor frozen from the parent Purchase Order line at receipt-creation time. Never re-resolved from current master data.',
  })
  conversionFactor!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'quantity × conversionFactor, computed once at creation. The only value ever sent to Inventory.',
  })
  baseQuantity!: string | null;
}

export class GoodsReceiptDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  purchaseOrderId!: string;

  @ApiProperty()
  warehouseId!: string;

  @ApiProperty({ enum: ['PENDING_STOCK', 'POSTED', 'REVERSED'] })
  status!: string;

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

  @ApiProperty({ type: [GoodsReceiptItemDto] })
  items!: GoodsReceiptItemDto[];
}

export class GoodsReceiptListDto {
  @ApiProperty({ type: [GoodsReceiptDto] })
  items!: GoodsReceiptDto[];
}
