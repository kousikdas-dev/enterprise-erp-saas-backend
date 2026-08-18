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

export class CreateProductDto {
  @ApiProperty({ example: 'SKU-001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  sku!: string;

  @ApiProperty({ example: 'Widget' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  unitOfMeasureId!: string;

  @ApiProperty({ example: '19.9900', description: 'Decimal string' })
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  sellingPrice!: string;

  @ApiProperty({ example: '10.0000', description: 'Decimal string' })
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  costPrice!: string;
}

export class UpdateProductDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  sku?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  unitOfMeasureId?: string;

  @ApiPropertyOptional({ description: 'Decimal string' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : String(value),
  )
  @IsString()
  sellingPrice?: string;

  @ApiPropertyOptional({ description: 'Decimal string' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : String(value),
  )
  @IsString()
  costPrice?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ProductDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  sku!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty()
  categoryId!: string;

  @ApiProperty()
  unitOfMeasureId!: string;

  @ApiProperty({ example: '19.9900' })
  sellingPrice!: string;

  @ApiProperty({ example: '10.0000' })
  costPrice!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class ProductListDto {
  @ApiProperty({ type: [ProductDto] })
  items!: ProductDto[];
}
