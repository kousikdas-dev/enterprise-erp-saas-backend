import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CreatePricelistItemDto } from './pricelist-item.dto';

export class CreatePricelistDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  /** Optional initial set of rule lines, created together with the pricelist. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePricelistItemDto)
  items?: CreatePricelistItemDto[];
}

export class UpdatePricelistDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
