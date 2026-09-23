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

  // Inventory Valuation V1 (Phase 2): required for ADJUSTMENT_IN (there is
  // no other source of cost for stock entering via this endpoint), and must
  // be OMITTED for ADJUSTMENT_OUT (its cost is always the current moving
  // average, computed server-side — a client-supplied value here would be
  // silently wrong the instant the average has since moved). Because the
  // requirement is conditional on `type`, it can't be expressed as a single
  // unconditional class-validator decorator here — StockService.adjust()
  // enforces both directions explicitly and returns a distinct error code
  // for each.
  @IsOptional()
  @IsString()
  unitCost?: string;

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
