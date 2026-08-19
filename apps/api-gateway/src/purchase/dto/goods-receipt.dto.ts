import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsString,
  IsUUID,
  ValidateNested,
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
  items!: CreateGoodsReceiptLineDto[];
}

export class GoodsReceiptItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  purchaseOrderItemId!: string;

  @ApiProperty()
  quantity!: string;
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

  @ApiProperty({ enum: ['PENDING_STOCK', 'POSTED'] })
  status!: string;

  @ApiProperty({ type: [GoodsReceiptItemDto] })
  items!: GoodsReceiptItemDto[];
}

export class GoodsReceiptListDto {
  @ApiProperty({ type: [GoodsReceiptDto] })
  items!: GoodsReceiptDto[];
}
