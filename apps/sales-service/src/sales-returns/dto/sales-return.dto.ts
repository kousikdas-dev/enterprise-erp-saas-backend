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
  // At least one of salesInvoiceItemId/shipmentItemId must be set (enforced
  // by @AtLeastOneReturnReference() below, and re-checked in the service as
  // defense-in-depth). Both set = the common case (invoiced AND shipped
  // goods coming back). Invoice-only = goodwill/pricing credit, no stock
  // movement. Shipment-only = physical return of never-invoiced goods.
  @IsOptional()
  @IsUUID()
  salesInvoiceItemId?: string;

  @IsOptional()
  @IsUUID()
  shipmentItemId?: string;

  // Commercial UOM quantity, same unit as whichever reference is set (mirrors
  // CreatePurchaseReturnLineDto.quantity's own convention exactly).
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  quantity!: string;
}

// Mirrors CreatePurchaseReturnDto's NoDuplicateGoodsReceiptItems (D13) — the
// service independently re-checks this as defense-in-depth.
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
            return true; // @IsArray() reports the type error separately
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
  @IsUUID()
  salesInvoiceId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSalesReturnLineDto)
  @AtLeastOneReturnReference()
  items!: CreateSalesReturnLineDto[];
}
