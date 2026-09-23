import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CreateOpeningStockLineDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  warehouseId!: string;

  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  quantity!: string;

  @IsUUID()
  unitOfMeasureId!: string;

  // Mandatory unit cost per BASE unit (Inventory Valuation V1, Phase 2).
  // Stock.totalValue is authoritative moving-average valuation, so a new
  // line is never allowed to create positive quantity with zero valuation
  // by simply omitting this field — every NEW request through this DTO is
  // rejected with 400 if it's missing. OpeningStockLine.unitCost stays
  // nullable at the SCHEMA level purely for historical rows created before
  // this field existed (or before it became mandatory) — those are read-only
  // past data, never produced by this DTO again.
  @Transform(({ value }: { value: unknown }) => (value === undefined ? value : String(value)))
  @IsString()
  @IsNotEmpty()
  unitCost!: string;
}

export class CreateOpeningStockDto {
  @IsISO8601()
  effectiveDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOpeningStockLineDto)
  lines?: CreateOpeningStockLineDto[];
}

export class UpdateOpeningStockDto {
  @IsOptional()
  @IsISO8601()
  effectiveDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

// Same shape as CreateOpeningStockLineDto — kept as a distinct export so the
// standalone add-line endpoint's DTO can evolve independently later without
// affecting CreateOpeningStockDto's inline lines array.
export class AddOpeningStockLineDto extends CreateOpeningStockLineDto {}

export class ReverseOpeningStockDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class OpeningStockQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  effectiveFrom?: string;

  @IsOptional()
  @IsString()
  effectiveTo?: string;
}
