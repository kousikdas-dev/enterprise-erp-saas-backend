import { ApiProperty } from '@nestjs/swagger';
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
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  salesOrderItemId!: string;

  @ApiProperty({ example: '10' })
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  quantity!: string;
}

export class CreateShipmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  salesOrderId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  warehouseId!: string;

  @ApiProperty({ type: [CreateShipmentItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateShipmentItemDto)
  items!: CreateShipmentItemDto[];
}

export class ShipmentItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  salesOrderItemId!: string;

  @ApiProperty()
  productId!: string;

  @ApiProperty()
  productSku!: string;

  @ApiProperty()
  productName!: string;

  @ApiProperty()
  quantity!: string;

  @ApiProperty()
  warehouseId!: string;

  @ApiProperty({ nullable: true })
  baseQuantity!: string | null;

  @ApiProperty({ nullable: true })
  conversionFactor!: string | null;

  @ApiProperty({ nullable: true })
  unitOfMeasureId!: string | null;

  @ApiProperty({ nullable: true })
  uomCode!: string | null;

  @ApiProperty({ nullable: true })
  uomName!: string | null;

  @ApiProperty({
    description:
      'True only while the shipment is UOM_RESOLUTION_REQUIRED and this specific line is the reason.',
  })
  needsConversionResolution!: boolean;

  @ApiProperty({ nullable: true })
  conversionResolvedBy!: string | null;

  @ApiProperty({ nullable: true })
  conversionResolvedAt!: string | null;

  @ApiProperty({ nullable: true })
  conversionResolutionNote!: string | null;
}

export class ResolveShipmentLineConversionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  unitOfMeasureId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ShipmentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  salesOrderId!: string;

  @ApiProperty()
  warehouseId!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty({ type: [ShipmentItemDto] })
  items!: ShipmentItemDto[];
}

export class ShipmentListDto {
  @ApiProperty({ type: [ShipmentDto] })
  items!: ShipmentDto[];
}
