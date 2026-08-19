import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class CreateGoodsReceiptLineDto {
  @IsUUID()
  purchaseOrderItemId!: string;

  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  quantity!: string;
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
  items!: CreateGoodsReceiptLineDto[];
}
