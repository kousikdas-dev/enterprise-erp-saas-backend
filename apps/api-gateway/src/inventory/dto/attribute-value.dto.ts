import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({ example: 'Red' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  value!: string;

  @ApiPropertyOptional({
    description: '"Free text" — value is a customer-entered placeholder.',
  })
  @IsOptional()
  @IsBoolean()
  isCustom?: boolean;

  @ApiPropertyOptional({ example: '0.0000', description: 'Decimal string' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : String(value),
  )
  @IsString()
  extraPrice?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sequence?: number;
}

export class UpdateAttributeValueDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  value?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isCustom?: boolean;

  @ApiPropertyOptional({ description: 'Decimal string' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : String(value),
  )
  @IsString()
  extraPrice?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sequence?: number;
}

export class AttributeValueDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  attributeId!: string;

  @ApiProperty()
  value!: string;

  @ApiProperty()
  isCustom!: boolean;

  @ApiProperty({ example: '0.0000' })
  extraPrice!: string;

  @ApiProperty()
  sequence!: number;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class RemoveAttributeValueResultDto {
  @ApiProperty()
  attributeId!: string;

  @ApiProperty()
  id!: string;

  @ApiProperty()
  removed!: boolean;
}
