import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateUnitDto {
  @ApiProperty({ example: 'PCS' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code!: string;

  @ApiProperty({ example: 'Pieces' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Unit this one converts to. Must be set together with conversionFactor.',
  })
  @IsOptional()
  @IsUUID()
  referenceUnitId?: string;

  @ApiPropertyOptional({
    example: '12.000000',
    description: 'Decimal string — how many of referenceUnit this unit contains.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : String(value),
  )
  @IsString()
  conversionFactor?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  unspscCategoryId?: string;
}

export class UpdateUnitDto {
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
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  referenceUnitId?: string;

  @ApiPropertyOptional({ description: 'Decimal string' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : String(value),
  )
  @IsString()
  conversionFactor?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  unspscCategoryId?: string;
}

export class UnitDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  referenceUnitId!: string | null;

  @ApiPropertyOptional({ example: '12.000000', nullable: true })
  conversionFactor!: string | null;

  @ApiPropertyOptional({ nullable: true })
  referenceUnitCode!: string | null;

  @ApiPropertyOptional({ nullable: true })
  referenceUnitName!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  unspscCategoryId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  unspscCategoryCode!: string | null;

  @ApiPropertyOptional({ nullable: true })
  unspscCategoryName!: string | null;
}

export class UnitListDto {
  @ApiProperty({ type: [UnitDto] })
  items!: UnitDto[];
}
