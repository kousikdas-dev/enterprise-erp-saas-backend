import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export enum ProductionOrderPriorityDto {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export class CreateProductionOrderItemDto {
  @ApiProperty({ format: 'uuid', description: 'Inventory-service Product id.' })
  @IsUUID()
  componentProductId!: string;

  @ApiProperty({ example: '1.050000' })
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  quantity!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  unitOfMeasureId!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  sequence!: number;
}

export class CreateProductionOrderDto {
  @ApiProperty({ format: 'uuid', description: 'Inventory-service Product id.' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ format: 'uuid', description: "Must be an ACTIVE BOM for this product." })
  @IsUUID()
  bomId!: string;

  @ApiProperty({ example: '1000.000000' })
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  plannedQuantity!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  outputUnitOfMeasureId!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Inventory-service Warehouse id.' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({ enum: ProductionOrderPriorityDto, default: 'NORMAL' })
  @IsOptional()
  @IsEnum(ProductionOrderPriorityDto)
  priority?: ProductionOrderPriorityDto;

  @ApiProperty({ format: 'date' })
  @IsISO8601()
  orderDate!: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsISO8601()
  plannedStartDate?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsISO8601()
  plannedEndDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({
    type: [CreateProductionOrderItemDto],
    description:
      'Components for this order. Omit to default from the selected BOM (scaled to plannedQuantity); pass an array (possibly empty) to set the list explicitly.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductionOrderItemDto)
  items?: CreateProductionOrderItemDto[];
}

export class UpdateProductionOrderDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  bomId?: string;

  @ApiPropertyOptional({ example: '1000.000000' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  plannedQuantity?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  outputUnitOfMeasureId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({ enum: ProductionOrderPriorityDto })
  @IsOptional()
  @IsEnum(ProductionOrderPriorityDto)
  priority?: ProductionOrderPriorityDto;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsISO8601()
  orderDate?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsISO8601()
  plannedStartDate?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsISO8601()
  plannedEndDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({
    type: [CreateProductionOrderItemDto],
    description:
      'Replaces the full components list for this order (DRAFT only). Omit to leave components unchanged.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductionOrderItemDto)
  items?: CreateProductionOrderItemDto[];
}

export class ProductionOrderItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  componentProductId!: string;

  @ApiProperty()
  componentProductSku!: string;

  @ApiProperty()
  componentProductName!: string;

  @ApiProperty()
  quantity!: string;

  @ApiProperty()
  unitOfMeasureId!: string;

  @ApiProperty()
  uomCode!: string;

  @ApiProperty()
  uomName!: string;

  @ApiProperty()
  sequence!: number;
}

export class ProductionOrderDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty({ example: 'MO-000001' })
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

  @ApiPropertyOptional({ nullable: true, description: 'Reserved for future Manufacturing Routing.' })
  routingId!: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Reserved for future Manufacturing Routing.' })
  routingVersion!: number | null;

  @ApiProperty({ example: '1000.000000' })
  plannedQuantity!: string;

  @ApiProperty()
  outputUnitOfMeasureId!: string;

  @ApiProperty()
  outputUomCode!: string;

  @ApiProperty()
  outputUomName!: string;

  @ApiProperty()
  orderDate!: string;

  @ApiPropertyOptional({ nullable: true })
  plannedStartDate!: string | null;

  @ApiPropertyOptional({ nullable: true })
  plannedEndDate!: string | null;

  @ApiPropertyOptional({ nullable: true })
  warehouseId!: string | null;

  @ApiProperty({ enum: ProductionOrderPriorityDto })
  priority!: string;

  @ApiProperty({ example: 'DRAFT' })
  status!: string;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;

  @ApiProperty({ type: [ProductionOrderItemDto] })
  items!: ProductionOrderItemDto[];
}

export class ProductionOrderListDto {
  @ApiProperty({ type: [ProductionOrderDto] })
  items!: ProductionOrderDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;
}
