import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsString,
  IsUUID,
  ValidateNested,
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';

export class CreateGoodsReceiptLineDto {
  @IsUUID()
  purchaseOrderItemId!: string;

  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  quantity!: string;
}

// D13 — reject duplicate purchaseOrderItemId values within one
// CreateGoodsReceiptDto, so the request fails fast with a 400 before
// reaching the service. The service layer independently re-checks this
// (defense-in-depth), so this validator is not the sole guard.
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
            return true; // @IsArray() reports the type error separately
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
  @IsUUID()
  purchaseOrderId!: string;

  @IsUUID()
  warehouseId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateGoodsReceiptLineDto)
  @NoDuplicatePurchaseOrderItems()
  items!: CreateGoodsReceiptLineDto[];
}
