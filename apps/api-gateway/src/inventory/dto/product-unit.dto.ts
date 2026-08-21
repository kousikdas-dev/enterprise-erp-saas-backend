import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateProductUnitDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  unitOfMeasureId!: string;

  @ApiProperty({ example: '12.000000', description: 'Decimal string' })
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  conversionFactor!: string;

  @ApiProperty({ example: '90.0000', description: 'Decimal string' })
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  sellingPrice!: string;

  @ApiProperty({ example: '80.0000', description: 'Decimal string' })
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  costPrice!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateProductUnitDto {
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
  conversionFactor?: string;

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

export class ProductUnitDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  productId!: string;

  @ApiProperty()
  unitOfMeasureId!: string;

  @ApiProperty({ example: '12.000000' })
  conversionFactor!: string;

  @ApiProperty({ example: '90.0000' })
  sellingPrice!: string;

  @ApiProperty({ example: '80.0000' })
  costPrice!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class ProductUnitListDto {
  @ApiProperty({ type: [ProductUnitDto] })
  items!: ProductUnitDto[];
}

export class RemoveProductUnitResultDto {
  @ApiProperty()
  productId!: string;

  @ApiProperty()
  id!: string;

  @ApiProperty()
  removed!: boolean;
}
