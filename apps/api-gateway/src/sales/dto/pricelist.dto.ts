import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
import {
  CreatePricelistItemDto,
  PricelistItemDto,
} from './pricelist-item.dto';

export class CreatePricelistDto {
  @ApiProperty({ example: 'EU Wholesale' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ type: [CreatePricelistItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePricelistItemDto)
  items?: CreatePricelistItemDto[];
}

export class UpdatePricelistDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class PricelistDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;

  @ApiProperty()
  itemCount!: number;

  @ApiPropertyOptional({ type: [PricelistItemDto] })
  items?: PricelistItemDto[];
}

export class PricelistListDto {
  @ApiProperty({ type: [PricelistDto] })
  items!: PricelistDto[];
}
