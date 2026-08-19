import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CreateSalesOrderItemDto {
  @IsUUID()
  productId!: string;

  @IsString()
  @MaxLength(64)
  productSku!: string;

  @IsString()
  @MaxLength(160)
  productName!: string;

  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  quantity!: string;

  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  unitPrice!: string;
}

export class CreateSalesOrderDto {
  @IsUUID()
  customerId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  billingAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  shippingAddress?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSalesOrderItemDto)
  items!: CreateSalesOrderItemDto[];
}

export class UpdateSalesOrderDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  billingAddress?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  shippingAddress?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSalesOrderItemDto)
  items?: CreateSalesOrderItemDto[];
}
