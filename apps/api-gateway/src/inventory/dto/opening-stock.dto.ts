import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CreateOpeningStockLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  warehouseId!: string;

  @ApiProperty({ example: '100' })
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  quantity!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  unitOfMeasureId!: string;
}

export class CreateOpeningStockDto {
  @ApiProperty({ example: '2026-01-01' })
  @IsISO8601()
  effectiveDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ type: [CreateOpeningStockLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOpeningStockLineDto)
  lines?: CreateOpeningStockLineDto[];
}

export class UpdateOpeningStockDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  effectiveDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class AddOpeningStockLineDto extends CreateOpeningStockLineDto {}

export class ReverseOpeningStockDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class OpeningStockQueryDto {
  @ApiPropertyOptional({ enum: ['DRAFT', 'POSTED', 'REVERSED'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'ISO-8601 start of effectiveDate range' })
  @IsOptional()
  @IsString()
  effectiveFrom?: string;

  @ApiPropertyOptional({ description: 'ISO-8601 end of effectiveDate range' })
  @IsOptional()
  @IsString()
  effectiveTo?: string;
}

export class OpeningStockLineDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  productId!: string;

  @ApiProperty()
  warehouseId!: string;

  @ApiProperty({ example: '100.000000' })
  quantity!: string;

  @ApiProperty()
  unitOfMeasureId!: string;

  @ApiProperty()
  uomCode!: string;

  @ApiProperty()
  uomName!: string;

  @ApiProperty({ example: '1' })
  conversionFactor!: string;

  @ApiProperty({ example: '100.000000' })
  baseQuantity!: string;

  @ApiPropertyOptional({ nullable: true })
  stockMovementId!: string | null;
}

export class OpeningStockDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  documentNumber!: string;

  @ApiProperty({ enum: ['DRAFT', 'POSTED', 'REVERSED'] })
  status!: string;

  @ApiProperty()
  effectiveDate!: string;

  @ApiPropertyOptional({ nullable: true })
  postedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  postedBy!: string | null;

  @ApiPropertyOptional({ nullable: true })
  reversedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  reversedBy!: string | null;

  @ApiPropertyOptional({ nullable: true })
  reversalReason!: string | null;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;

  @ApiProperty()
  createdBy!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;

  @ApiProperty({ type: [OpeningStockLineDto] })
  lines!: OpeningStockLineDto[];

  @ApiPropertyOptional({
    description:
      'Present only on an idempotent-replay response: OPENING_ALREADY_POSTED or OPENING_ALREADY_REVERSED.',
  })
  code?: string;
}

export class OpeningStockListDto {
  @ApiProperty({ type: [OpeningStockDto] })
  items!: OpeningStockDto[];
}
