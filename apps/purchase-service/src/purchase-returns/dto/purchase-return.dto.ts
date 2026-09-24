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
  @IsUUID()
  goodsReceiptItemId!: string;

  // Commercial UOM, same unit as the referenced GoodsReceiptItem — never a
  // base-UOM quantity (mirrors CreateGoodsReceiptLineDto.quantity's own
  // convention exactly).
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  quantity!: string;
}

// Mirrors CreateGoodsReceiptDto's NoDuplicatePurchaseOrderItems (D13) — reject
// duplicate goodsReceiptItemId values within one request, so the request
// fails fast with a 400 before reaching the service (which independently
// re-checks this as defense-in-depth).
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
            return true; // @IsArray() reports the type error separately
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
  @IsUUID()
  goodsReceiptId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseReturnLineDto)
  @NoDuplicateGoodsReceiptItems()
  items!: CreatePurchaseReturnLineDto[];
}
