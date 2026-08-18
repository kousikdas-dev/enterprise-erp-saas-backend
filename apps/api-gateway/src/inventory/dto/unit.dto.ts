import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateUnitDto {
  @ApiProperty({ example: 'PCS' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code!: string;

  @ApiProperty({ example: 'Pieces' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;
}

export class UpdateUnitDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UnitDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class UnitListDto {
  @ApiProperty({ type: [UnitDto] })
  items!: UnitDto[];
}
