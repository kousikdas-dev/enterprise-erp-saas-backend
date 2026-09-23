import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

const PURPOSES = [
  'PURCHASE_EXPENSE',
  'ACCOUNTS_PAYABLE',
  'INPUT_TAX',
  'PAYMENT_METHOD',
  'SALES_REVENUE',
  'ACCOUNTS_RECEIVABLE',
  'OUTPUT_TAX',
  'SALES_DISCOUNT',
  'INVENTORY_ASSET',
  'COGS',
  'GOODS_RECEIVED_NOT_INVOICED',
  'PURCHASE_PRICE_VARIANCE',
  'OPENING_BALANCE_EQUITY',
] as const;

export type AccountMappingPurposeInput = (typeof PURPOSES)[number];

export class CreateAccountMappingDto {
  @IsIn(PURPOSES)
  purpose!: AccountMappingPurposeInput;

  // Required (and validated as such in the service) when purpose is the
  // per-entity PAYMENT_METHOD purpose — the id of the master-data
  // PaymentMethod this mapping is for. Must be omitted for every tenant-wide
  // singleton purpose (PURCHASE_EXPENSE/ACCOUNTS_PAYABLE/INPUT_TAX/
  // SALES_REVENUE/ACCOUNTS_RECEIVABLE/OUTPUT_TAX/SALES_DISCOUNT), which
  // always resolve at externalRefId = "".
  @IsOptional()
  @IsString()
  @MaxLength(64)
  externalRefId?: string;

  @IsUUID()
  accountId!: string;
}

export class UpdateAccountMappingDto {
  @IsUUID()
  accountId!: string;
}
