import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export enum PricelistApplyOn {
  ALL_PRODUCTS = 'ALL_PRODUCTS',
  CATEGORY = 'CATEGORY',
  PRODUCT = 'PRODUCT',
}

export enum PricelistComputeMethod {
  FIXED_PRICE = 'FIXED_PRICE',
  DISCOUNT_PERCENT = 'DISCOUNT_PERCENT',
}

export class CreatePricelistItemDto {
  @ApiPropertyOptional({ enum: PricelistApplyOn })
  @IsOptional()
  @IsEnum(PricelistApplyOn)
  applyOn?: PricelistApplyOn;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ enum: PricelistComputeMethod })
  @IsOptional()
  @IsEnum(PricelistComputeMethod)
  computeMethod?: PricelistComputeMethod;

  @ApiPropertyOptional({ example: '99.0000', description: 'Decimal string' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : String(value),
  )
  @IsString()
  fixedPrice?: string;

  @ApiPropertyOptional({ example: '10.00', description: 'Decimal string, 0-100' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : String(value),
  )
  @IsString()
  discountPercent?: string;

  @ApiPropertyOptional({ example: '0.0000', description: 'Decimal string' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : String(value),
  )
  @IsString()
  minQuantity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  validTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sequence?: number;
}

export class UpdatePricelistItemDto extends CreatePricelistItemDto {}

export class PricelistItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  pricelistId!: string;

  @ApiProperty({ enum: PricelistApplyOn })
  applyOn!: PricelistApplyOn;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  categoryId!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  productId!: string | null;

  @ApiProperty({ enum: PricelistComputeMethod })
  computeMethod!: PricelistComputeMethod;

  @ApiPropertyOptional({ nullable: true })
  fixedPrice!: string | null;

  @ApiPropertyOptional({ nullable: true })
  discountPercent!: string | null;

  @ApiProperty()
  minQuantity!: string;

  @ApiPropertyOptional({ nullable: true })
  validFrom!: string | null;

  @ApiPropertyOptional({ nullable: true })
  validTo!: string | null;

  @ApiProperty()
  sequence!: number;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class RemovePricelistItemResultDto {
  @ApiProperty()
  pricelistId!: string;

  @ApiProperty()
  id!: string;

  @ApiProperty()
  removed!: boolean;
}
