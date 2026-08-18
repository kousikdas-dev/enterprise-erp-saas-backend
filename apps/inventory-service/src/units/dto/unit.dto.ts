import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateUnitDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;
}

export class UpdateUnitDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
