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
import { ProductionOrderPriority } from '../../../generated/prisma-client';

export class CreateProductionOrderItemDto {
  @IsUUID()
  componentProductId!: string;

  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  quantity!: string;

  @IsUUID()
  unitOfMeasureId!: string;

  @IsInt()
  @Min(1)
  sequence!: number;
}

export class CreateProductionOrderDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  bomId!: string;

  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  plannedQuantity!: string;

  @IsUUID()
  outputUnitOfMeasureId!: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsEnum(ProductionOrderPriority)
  priority?: ProductionOrderPriority;

  @IsISO8601()
  orderDate!: string;

  @IsOptional()
  @IsISO8601()
  plannedStartDate?: string;

  @IsOptional()
  @IsISO8601()
  plannedEndDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductionOrderItemDto)
  items?: CreateProductionOrderItemDto[];
}

export class UpdateProductionOrderDto {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  bomId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  plannedQuantity?: string;

  @IsOptional()
  @IsUUID()
  outputUnitOfMeasureId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsEnum(ProductionOrderPriority)
  priority?: ProductionOrderPriority;

  @IsOptional()
  @IsISO8601()
  orderDate?: string;

  @IsOptional()
  @IsISO8601()
  plannedStartDate?: string;

  @IsOptional()
  @IsISO8601()
  plannedEndDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductionOrderItemDto)
  items?: CreateProductionOrderItemDto[];
}
