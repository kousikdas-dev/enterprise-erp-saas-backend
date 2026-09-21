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

export class CreateShipmentItemDto {
  @IsUUID()
  salesOrderItemId!: string;

  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  quantity!: string;
}

export class CreateShipmentDto {
  @IsUUID()
  salesOrderId!: string;

  @IsUUID()
  warehouseId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateShipmentItemDto)
  items!: CreateShipmentItemDto[];
}

// PATCH /shipments/:id/lines/:lineId/resolve-conversion — manual, audited
// resolution for a legacy ShipmentItem whose historical UOM/conversionFactor
// could not be safely recovered (Inventory Design v4, Sales Shipment UOM
// Phase A, §5-C/§11). unitOfMeasureId must resolve to either the line's
// product's base unit or one of its configured alternate units — validated
// against Inventory's per-product UOM options, never a bare client-supplied
// conversionFactor.
export class ResolveShipmentLineConversionDto {
  @IsUUID()
  unitOfMeasureId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
