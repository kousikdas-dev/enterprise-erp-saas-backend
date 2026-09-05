import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const TAX_COMPONENT_TYPES = ['CGST', 'SGST', 'IGST', 'CESS', 'OTHER'] as const;
type TaxComponentTypeValue = (typeof TAX_COMPONENT_TYPES)[number];

export class CreateTaxComponentDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  sequence!: number;

  @ApiProperty({ enum: TAX_COMPONENT_TYPES })
  @IsIn(TAX_COMPONENT_TYPES)
  type!: TaxComponentTypeValue;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @ApiProperty({ example: '9.0000' })
  @IsString()
  rate!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Optional Chart of Accounts account id' })
  @IsOptional()
  @IsUUID()
  accountId?: string;
}

export class CreateTaxCodeDto {
  @ApiProperty({ example: 'GST18_LOCAL' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code!: string;

  @ApiProperty({ example: 'GST 18% Local' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ type: [CreateTaxComponentDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateTaxComponentDto)
  components!: CreateTaxComponentDto[];
}

export class UpdateTaxCodeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional({
    type: [CreateTaxComponentDto],
    description: "When provided, replaces the tax code's entire component set.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateTaxComponentDto)
  components?: CreateTaxComponentDto[];
}

export class UpdateTaxCodeStatusDto {
  @ApiProperty({ description: 'true to activate, false to deactivate' })
  @IsBoolean()
  isActive!: boolean;
}

export class TaxComponentAccountDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;
}

export class TaxComponentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'uuid' })
  taxCodeId!: string;

  @ApiProperty()
  sequence!: number;

  @ApiProperty({ enum: TAX_COMPONENT_TYPES })
  type!: TaxComponentTypeValue;

  @ApiPropertyOptional({ nullable: true })
  name!: string | null;

  @ApiProperty()
  rate!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  accountId!: string | null;

  @ApiPropertyOptional({ type: TaxComponentAccountDto, nullable: true })
  account!: TaxComponentAccountDto | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class TaxCodeDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;

  @ApiProperty({ type: [TaxComponentDto] })
  components!: TaxComponentDto[];
}

export class TaxCodeListDto {
  @ApiProperty({ type: [TaxCodeDto] })
  items!: TaxCodeDto[];
}
