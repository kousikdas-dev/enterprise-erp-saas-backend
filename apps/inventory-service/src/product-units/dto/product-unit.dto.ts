import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateProductUnitDto {
  @IsUUID()
  unitOfMeasureId!: string;

  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  conversionFactor!: string;

  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  sellingPrice!: string;

  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  costPrice!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateProductUnitDto {
  @IsOptional()
  @IsUUID()
  unitOfMeasureId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : String(value),
  )
  @IsString()
  conversionFactor?: string;

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
