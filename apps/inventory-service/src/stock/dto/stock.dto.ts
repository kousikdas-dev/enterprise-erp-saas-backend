import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { StockMovementType } from '../../../generated/prisma-client';

// OPENING was removed from here in Inventory Design v4, Phase B: opening
// balances are now created exclusively through the dedicated Opening Stock
// document (POST /opening-stock + .../post), which brings the idempotency,
// existing-stock and duplicate-opening safeguards this generic endpoint
// never had. StockMovementType.OPENING itself is retained at the schema
// level — historical rows created via this endpoint before the change
// remain valid, unattributed, legacy movements.
export enum ImplementedStockAdjustmentType {
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
