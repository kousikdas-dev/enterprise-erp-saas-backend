import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AccountParentDto } from './account.dto';

const ACCOUNT_MAPPING_PURPOSES = [
  'PURCHASE_EXPENSE',
  'ACCOUNTS_PAYABLE',
  'INPUT_TAX',
  'PAYMENT_METHOD',
] as const;
export type AccountMappingPurposeValue =
  (typeof ACCOUNT_MAPPING_PURPOSES)[number];

export class CreateAccountMappingDto {
  @ApiProperty({ enum: ACCOUNT_MAPPING_PURPOSES })
  @IsIn(ACCOUNT_MAPPING_PURPOSES)
  purpose!: AccountMappingPurposeValue;

  @ApiPropertyOptional({
    description:
      'Required only for the per-entity PAYMENT_METHOD purpose (the master-data PaymentMethod id). Must be omitted for the tenant-wide purposes (PURCHASE_EXPENSE/ACCOUNTS_PAYABLE/INPUT_TAX).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  externalRefId?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  accountId!: string;
}

export class UpdateAccountMappingDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  accountId!: string;
}

export class AccountMappingDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ enum: ACCOUNT_MAPPING_PURPOSES })
  purpose!: AccountMappingPurposeValue;

  @ApiProperty({
    description:
      '"" for tenant-wide purposes; the master-data PaymentMethod id for PAYMENT_METHOD.',
  })
  externalRefId!: string;

  @ApiProperty({ format: 'uuid' })
  accountId!: string;

  @ApiPropertyOptional({ type: AccountParentDto, nullable: true })
  account!: AccountParentDto | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class AccountMappingListDto {
  @ApiProperty({ type: [AccountMappingDto] })
  items!: AccountMappingDto[];
}
