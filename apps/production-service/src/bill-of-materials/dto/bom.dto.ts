import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateBomItemDto {
  @IsUUID()
  componentProductId!: string;

  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  quantity!: string;

  @IsUUID()
  unitOfMeasureId!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  scrapPercentage?: string;

  @IsInt()
  @Min(1)
  sequence!: number;
}

export class CreateBomOperationDto {
  @IsUUID()
  operationId!: string;

  @IsInt()
  @Min(1)
  sequence!: number;
}

export class CreateBomDto {
  @IsUUID()
  parentProductId!: string;

  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  bomQuantity!: string;

  @IsUUID()
  outputUnitOfMeasureId!: string;

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;

  @IsOptional()
  @IsISO8601()
  effectiveTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateBomItemDto)
  items!: CreateBomItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBomOperationDto)
  operations?: CreateBomOperationDto[];

  @IsOptional()
  @IsUUID()
  productVariantId?: string;
}

export class UpdateBomDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  bomQuantity?: string;

  @IsOptional()
  @IsUUID()
  outputUnitOfMeasureId?: string;

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;

  @IsOptional()
  @IsISO8601()
  effectiveTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateBomItemDto)
  items?: CreateBomItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBomOperationDto)
  operations?: CreateBomOperationDto[];

  /** Pass a UUID to scope this BOM to one variant, or explicit null to clear back to "all variants"; omit to leave unchanged. class-validator's @IsOptional() already treats null as "skip validators", which is exactly the pass-through-as-null behavior wanted here. */
  @IsOptional()
  @IsUUID()
  productVariantId?: string | null;
}
