import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { StockMovementType } from '../../../generated/prisma-client';

export enum ImplementedStockAdjustmentType {
  OPENING = 'OPENING',
  ADJUSTMENT_IN = 'ADJUSTMENT_IN',
  ADJUSTMENT_OUT = 'ADJUSTMENT_OUT',
}

export class CreateStockAdjustmentDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  warehouseId!: string;

  @IsEnum(ImplementedStockAdjustmentType)
  type!: ImplementedStockAdjustmentType;

  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  quantity!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

export class StockQueryDto {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}

export class StockMovementQueryDto {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsEnum(StockMovementType)
  type?: StockMovementType;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}
