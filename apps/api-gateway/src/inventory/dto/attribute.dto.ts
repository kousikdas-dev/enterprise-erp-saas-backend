import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  AttributeValueDto,
  CreateAttributeValueDto,
} from './attribute-value.dto';

export enum AttributeDisplayType {
  RADIO = 'RADIO',
  SELECT = 'SELECT',
  COLOR = 'COLOR',
  PILLS = 'PILLS',
}

export enum AttributeVariantCreation {
  INSTANTLY = 'INSTANTLY',
  DYNAMICALLY = 'DYNAMICALLY',
  NEVER = 'NEVER',
}

export class CreateAttributeDto {
  @ApiProperty({ example: 'Size' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ enum: AttributeDisplayType })
  @IsOptional()
  @IsEnum(AttributeDisplayType)
  displayType?: AttributeDisplayType;

  @ApiPropertyOptional({ enum: AttributeVariantCreation })
  @IsOptional()
  @IsEnum(AttributeVariantCreation)
  variantCreation?: AttributeVariantCreation;

  @ApiPropertyOptional({ type: [CreateAttributeValueDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAttributeValueDto)
  values?: CreateAttributeValueDto[];
}

export class UpdateAttributeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: AttributeDisplayType })
  @IsOptional()
  @IsEnum(AttributeDisplayType)
  displayType?: AttributeDisplayType;

  @ApiPropertyOptional({ enum: AttributeVariantCreation })
  @IsOptional()
  @IsEnum(AttributeVariantCreation)
  variantCreation?: AttributeVariantCreation;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AttributeDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: AttributeDisplayType })
  displayType!: AttributeDisplayType;

  @ApiProperty({ enum: AttributeVariantCreation })
  variantCreation!: AttributeVariantCreation;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;

  @ApiPropertyOptional({ type: [AttributeValueDto] })
  values?: AttributeValueDto[];
}

export class AttributeListDto {
  @ApiProperty({ type: [AttributeDto] })
  items!: AttributeDto[];
}
