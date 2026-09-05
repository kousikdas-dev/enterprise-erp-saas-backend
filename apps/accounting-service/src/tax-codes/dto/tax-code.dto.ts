import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { TaxComponentType } from '../../../generated/prisma-client';

export class CreateTaxComponentDto {
  @IsInt()
  @Min(1)
  sequence!: number;

  @IsEnum(TaxComponentType)
  type!: TaxComponentType;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  rate!: string;

  @IsOptional()
  @IsUUID()
  accountId?: string;
}

export class CreateTaxCodeDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'code must not be blank' })
  @MaxLength(32)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'name must not be blank' })
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateTaxComponentDto)
  components!: CreateTaxComponentDto[];
}

export class UpdateTaxCodeDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'code must not be blank' })
  @MaxLength(32)
  code?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'name must not be blank' })
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateTaxComponentDto)
  components?: CreateTaxComponentDto[];
}

export class UpdateTaxCodeStatusDto {
  @IsBoolean()
  isActive!: boolean;
}
