import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateFiscalPositionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;
}

export class UpdateFiscalPositionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class FiscalPositionDto {
  id!: string;
  tenantId!: string;
  code!: string;
  name!: string;
  isActive!: boolean;
  createdAt!: string;
  updatedAt!: string;
}

export class FiscalPositionListDto {
  items!: FiscalPositionDto[];
}