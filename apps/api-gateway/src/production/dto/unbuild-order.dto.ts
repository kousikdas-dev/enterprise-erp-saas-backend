import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateUnbuildOrderDto {
  @ApiProperty({ format: 'uuid', description: 'Finished good to unbuild.' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  bomId!: string;

  @ApiProperty({ example: '2', description: 'Finished-good quantity to unbuild, in its base unit.' })
  @IsString()
  quantity!: string;

  @ApiProperty({ format: 'uuid', description: "Must be the product's current base unit." })
  @IsUUID()
  unitOfMeasureId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  warehouseId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Optional traceability reference to the Production Order that originally built this product.',
  })
  @IsOptional()
  @IsUUID()
  sourceProductionOrderId?: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  unbuildDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateUnbuildOrderDto {
  @ApiPropertyOptional({ example: '2' })
  @IsOptional()
  @IsString()
  quantity?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  unbuildDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UnbuildOrderItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  unbuildOrderId!: string;

  @ApiProperty()
  componentProductId!: string;

  @ApiProperty()
  componentProductSku!: string;

  @ApiProperty()
  componentProductName!: string;

  @ApiProperty({ example: '8.000000' })
  quantity!: string;

  @ApiProperty()
  unitOfMeasureId!: string;

  @ApiProperty()
  uomCode!: string;

  @ApiProperty()
  uomName!: string;

  @ApiProperty()
  sequence!: number;

  @ApiPropertyOptional({ nullable: true, description: 'inventory-service StockMovement id, set only once the order is DONE.' })
  stockMovementId!: string | null;
}

export class UnbuildOrderDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty({ example: 'UB-000001' })
  orderNumber!: string;

  @ApiProperty()
  productId!: string;

  @ApiProperty()
  productSku!: string;

  @ApiProperty()
  productName!: string;

  @ApiProperty()
  bomId!: string;

  @ApiProperty()
  bomVersion!: number;

  @ApiProperty({ example: '2.000000' })
  quantity!: string;

  @ApiProperty()
  unitOfMeasureId!: string;

  @ApiProperty()
  uomCode!: string;

  @ApiProperty()
  uomName!: string;

  @ApiProperty()
  warehouseId!: string;

  @ApiPropertyOptional({ nullable: true })
  sourceProductionOrderId!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'MO-000001' })
  sourceProductionOrderNumber!: string | null;

  @ApiProperty({ example: 'DRAFT' })
  status!: string;

  @ApiProperty({ format: 'date-time' })
  unbuildDate!: string;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  completedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  completedBy!: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'inventory-service StockMovement id for the finished-goods leg.' })
  finishedGoodsMovementId!: string | null;

  @ApiProperty({ type: [UnbuildOrderItemDto] })
  items!: UnbuildOrderItemDto[];
}

export class UnbuildOrderListDto {
  @ApiProperty({ type: [UnbuildOrderDto] })
  items!: UnbuildOrderDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;
}
