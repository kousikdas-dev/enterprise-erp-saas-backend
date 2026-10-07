import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateAttributeValueDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  value!: string;

  @IsOptional()
  @IsBoolean()
  isCustom?: boolean;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : String(value),
  )
  @IsString()
  extraPrice?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sequence?: number;
}

export class UpdateAttributeValueDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  value?: string;

  @IsOptional()
  @IsBoolean()
  isCustom?: boolean;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : String(value),
  )
  @IsString()
  extraPrice?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sequence?: number;
}
