import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/** Mirrors inventory-service's `ProductType` enum (Prisma-generated there; plain string enum here since the gateway has no Prisma client of its own). */
export enum ProductTypeDto {
  GOODS = 'GOODS',
  SERVICE = 'SERVICE',
  COMBO = 'COMBO',
}

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

  @ApiPropertyOptional({ enum: ProductTypeDto, default: 'GOODS' })
  @IsOptional()
  @IsEnum(ProductTypeDto)
  productType?: ProductTypeDto;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  trackInventory?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  barcode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Marks this product as a variant of a top-level product.',
  })
  @IsOptional()
  @IsUUID()
  templateProductId?: string;

  @ApiPropertyOptional({ type: [String], description: 'AttributeValue ids tagging this variant.' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  attributeValueIds?: string[];
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

  // Nullable editable field: omit to leave unchanged, send `null` to clear
  // it, send a string to set it — mirrors inventory-service's UpdateProductDto.
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

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

  @ApiPropertyOptional({ enum: ProductTypeDto })
  @IsOptional()
  @IsEnum(ProductTypeDto)
  productType?: ProductTypeDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  trackInventory?: boolean;

  // Nullable editable field — see `description` above.
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  barcode?: string | null;

  // Nullable editable field — see `description` above.
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;

  // Nullable editable field — see `description` above. `null` detaches this
  // product from its variant template; a string reassigns it.
  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Marks this product as a variant of a top-level product. Send null to detach.',
  })
  @IsOptional()
  @IsUUID()
  templateProductId?: string | null;

  @ApiPropertyOptional({ type: [String], description: 'AttributeValue ids tagging this variant.' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  attributeValueIds?: string[];
}

export class ProductAttributeValueDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  attributeId!: string;

  @ApiProperty()
  attributeName!: string;

  @ApiProperty()
  value!: string;
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

  @ApiProperty({ enum: ProductTypeDto })
  productType!: string;

  @ApiProperty()
  trackInventory!: boolean;

  @ApiPropertyOptional({ nullable: true })
  barcode!: string | null;

  @ApiPropertyOptional({ nullable: true })
  note!: string | null;

  @ApiPropertyOptional({ nullable: true })
  templateProductId!: string | null;

  @ApiProperty({ type: [ProductAttributeValueDto] })
  attributeValues!: ProductAttributeValueDto[];

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class ProductListDto {
  @ApiProperty({ type: [ProductDto] })
  items!: ProductDto[];
}
