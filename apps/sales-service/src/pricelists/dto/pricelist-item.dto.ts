import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import {
  PricelistApplyOn,
  PricelistComputeMethod,
} from '../../../generated/prisma-client';

export class CreatePricelistItemDto {
  @IsOptional()
  @IsEnum(PricelistApplyOn)
  applyOn?: PricelistApplyOn;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsEnum(PricelistComputeMethod)
  computeMethod?: PricelistComputeMethod;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : String(value),
  )
  @IsString()
  fixedPrice?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : String(value),
  )
  @IsString()
  discountPercent?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : String(value),
  )
  @IsString()
  minQuantity?: string;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sequence?: number;
}

export class UpdatePricelistItemDto extends CreatePricelistItemDto {}
