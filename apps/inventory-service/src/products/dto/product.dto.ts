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
import { Transform } from 'class-transformer';
import { ProductType } from '../../../generated/prisma-client';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  sku!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsUUID()
  categoryId!: string;

  @IsUUID()
  unitOfMeasureId!: string;

  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  sellingPrice!: string;

  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  costPrice!: string;

  @IsOptional()
  @IsEnum(ProductType)
  productType?: ProductType;

  @IsOptional()
  @IsBoolean()
  trackInventory?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  barcode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsUUID()
  templateProductId?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  attributeValueIds?: string[];
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  sku?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name?: string;

  // Nullable editable field: omit the key to leave unchanged, send `null`
  // to clear it, send a string to set it — see ProductsService.update().
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  unitOfMeasureId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : String(value),
  )
  @IsString()
  sellingPrice?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : String(value),
  )
  @IsString()
  costPrice?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(ProductType)
  productType?: ProductType;

  @IsOptional()
  @IsBoolean()
  trackInventory?: boolean;

  // Nullable editable field — see `description` above.
  @IsOptional()
  @IsString()
  @MaxLength(128)
  barcode?: string | null;

  // Nullable editable field — see `description` above.
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;

  // Nullable editable field — see `description` above. `null` detaches this
  // product from its variant template; a string reassigns it (both are
  // validated in ProductsService.assertValidTemplateAssignment()).
  @IsOptional()
  @IsUUID()
  templateProductId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  attributeValueIds?: string[];
}

export class ProductQueryDto {
  @IsOptional()
  @IsUUID()
  templateProductId?: string;
}
