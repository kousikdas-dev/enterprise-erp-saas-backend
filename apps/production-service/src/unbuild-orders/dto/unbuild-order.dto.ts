import { Transform } from 'class-transformer';
import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateUnbuildOrderDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  bomId!: string;

  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  quantity!: string;

  @IsUUID()
  unitOfMeasureId!: string;

  @IsUUID()
  warehouseId!: string;

  @IsOptional()
  @IsUUID()
  sourceProductionOrderId?: string;

  @IsISO8601()
  unbuildDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateUnbuildOrderDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  quantity?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsISO8601()
  unbuildDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
