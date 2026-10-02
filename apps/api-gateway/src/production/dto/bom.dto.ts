import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateBomItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  componentProductId!: string;

  @ApiProperty({ example: '1.050000' })
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  quantity!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  unitOfMeasureId!: string;

  @ApiPropertyOptional({ example: '2.50' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  scrapPercentage?: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  sequence!: number;
}

export class CreateBomDto {
  @ApiProperty({ format: 'uuid', description: 'Inventory-service Product id.' })
  @IsUUID()
  parentProductId!: string;

  @ApiProperty({
    example: '100.000000',
    description:
      'Quantity of the parent product this BOM produces (the manufacturing basis for all component quantities).',
  })
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  bomQuantity!: string;

  @ApiProperty({
    format: 'uuid',
    description:
      "Unit of measure the BOM quantity is expressed in. Must be the parent product's base UOM or one of its active alternative units.",
  })
  @IsUUID()
  outputUnitOfMeasureId!: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsISO8601()
  effectiveTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiProperty({ type: [CreateBomItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateBomItemDto)
  items!: CreateBomItemDto[];
}

export class UpdateBomDto {
  @ApiPropertyOptional({ example: '100.000000' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  bomQuantity?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  outputUnitOfMeasureId?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsISO8601()
  effectiveTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ type: [CreateBomItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateBomItemDto)
  items?: CreateBomItemDto[];
}

export class BomItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  componentProductId!: string;

  @ApiProperty()
  componentProductSku!: string;

  @ApiProperty()
  componentProductName!: string;

  @ApiProperty()
  quantity!: string;

  @ApiProperty()
  unitOfMeasureId!: string;

  @ApiProperty()
  uomCode!: string;

  @ApiProperty()
  uomName!: string;

  @ApiPropertyOptional({ nullable: true })
  scrapPercentage!: string | null;

  @ApiProperty()
  sequence!: number;
}

export class BomDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  parentProductId!: string;

  @ApiProperty()
  parentProductSku!: string;

  @ApiProperty()
  parentProductName!: string;

  @ApiProperty({ example: '100.000000' })
  bomQuantity!: string;

  @ApiProperty()
  outputUnitOfMeasureId!: string;

  @ApiProperty()
  outputUomCode!: string;

  @ApiProperty()
  outputUomName!: string;

  @ApiProperty()
  version!: number;

  @ApiProperty({ example: 'DRAFT' })
  status!: string;

  @ApiPropertyOptional({ nullable: true })
  effectiveFrom!: Date | string | null;

  @ApiPropertyOptional({ nullable: true })
  effectiveTo!: Date | string | null;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;

  @ApiProperty({ type: [BomItemDto] })
  items!: BomItemDto[];
}

export class BomListDto {
  @ApiProperty({ type: [BomDto] })
  items!: BomDto[];
}
