import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  AttributeDisplayType,
  AttributeVariantCreation,
} from '../../../generated/prisma-client';
import { CreateAttributeValueDto } from './attribute-value.dto';

export class CreateAttributeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsEnum(AttributeDisplayType)
  displayType?: AttributeDisplayType;

  @IsOptional()
  @IsEnum(AttributeVariantCreation)
  variantCreation?: AttributeVariantCreation;

  /** Optional initial set of values, created together with the attribute. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAttributeValueDto)
  values?: CreateAttributeValueDto[];
}

export class UpdateAttributeDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEnum(AttributeDisplayType)
  displayType?: AttributeDisplayType;

  @IsOptional()
  @IsEnum(AttributeVariantCreation)
  variantCreation?: AttributeVariantCreation;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
