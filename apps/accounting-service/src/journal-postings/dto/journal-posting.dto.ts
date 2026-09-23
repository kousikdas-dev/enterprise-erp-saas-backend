import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const ROLES = [
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
const SIDES = ['DEBIT', 'CREDIT'] as const;

export type JournalPostingRole = (typeof ROLES)[number];
export type JournalPostingSide = (typeof SIDES)[number];

export class CreateJournalPostingLineDto {
  @IsIn(ROLES)
  role!: JournalPostingRole;

  @IsIn(SIDES)
  side!: JournalPostingSide;

  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  amount!: string;

  // Required when role === PAYMENT_METHOD (validated in the service, not
  // here, since the requirement is conditional on another field).
  @IsOptional()
  @IsString()
  @MaxLength(64)
  paymentMethodId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class CreateJournalPostingDto {
  @IsString()
  @MaxLength(64)
  sourceService!: string;

  @IsString()
  @MaxLength(64)
  sourceType!: string;

  @IsUUID()
  sourceId!: string;

  @IsOptional()
  @IsISO8601()
  entryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => CreateJournalPostingLineDto)
  lines!: CreateJournalPostingLineDto[];
}

export class ReverseJournalPostingDto {
  @IsString()
  @MaxLength(64)
  sourceService!: string;

  // Identifies the ORIGINAL posting to reverse.
  @IsString()
  @MaxLength(64)
  sourceType!: string;

  @IsUUID()
  sourceId!: string;

  // The reversal entry's OWN sourceType — must differ from `sourceType`
  // above, since the reversal gets its own distinct source reference at
  // the same sourceId (e.g. "PURCHASE_INVOICE" -> "PURCHASE_INVOICE_CANCELLATION").
  @IsString()
  @MaxLength(64)
  reversalSourceType!: string;

  @IsOptional()
  @IsISO8601()
  entryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
