import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsISO8601,
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
