import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  sku!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsUUID()
  categoryId!: string;

  @IsUUID()
  unitOfMeasureId!: string;

  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  sellingPrice!: string;

  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  costPrice!: string;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  sku?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  unitOfMeasureId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : String(value),
  )
  @IsString()
  sellingPrice?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : String(value),
  )
  @IsString()
  costPrice?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
