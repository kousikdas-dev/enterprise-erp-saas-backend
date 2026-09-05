import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

const ACCOUNT_TYPES = [
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'REVENUE',
  'EXPENSE',
] as const;
type AccountTypeValue = (typeof ACCOUNT_TYPES)[number];

export class CreateAccountDto {
  @ApiProperty({ example: '1110' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code!: string;

  @ApiProperty({ example: 'Bank' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @ApiProperty({ enum: ACCOUNT_TYPES })
  @IsIn(ACCOUNT_TYPES)
  type!: AccountTypeValue;

  @ApiPropertyOptional({ format: 'uuid', description: 'Parent account id' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateAccountDto {
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
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ enum: ACCOUNT_TYPES })
  @IsOptional()
  @IsIn(ACCOUNT_TYPES)
  type?: AccountTypeValue;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Parent account id, or null to clear the parent',
  })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;
}

export class UpdateAccountStatusDto {
  @ApiProperty({ description: 'true to activate, false to deactivate' })
  @IsBoolean()
  isActive!: boolean;
}

export class AccountParentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;
}

export class AccountDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ACCOUNT_TYPES })
  type!: AccountTypeValue;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  parentId!: string | null;

  @ApiPropertyOptional({ type: AccountParentDto, nullable: true })
  parent!: AccountParentDto | null;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class AccountListDto {
  @ApiProperty({ type: [AccountDto] })
  items!: AccountDto[];
}
