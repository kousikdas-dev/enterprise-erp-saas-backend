import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsString,
  IsUUID,
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
