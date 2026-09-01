import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  Matches,
} from 'class-validator';

const PHONE_PATTERN = /^[+0-9][0-9().\s-]{5,63}$/;
const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i;

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  company?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(PHONE_PATTERN)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  jobPosition?: string;

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(255)
  website?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @Matches(GSTIN_PATTERN)
  gstin?: string;

  // Sales
  @IsOptional()
  @IsUUID()
  salespersonId?: string;

  @IsOptional()
  @IsUUID()
  paymentTermId?: string;

  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;

  @IsOptional()
  @IsUUID()
  fiscalPositionId?: string;

  @IsOptional()
  @IsUUID()
  industryId?: string;

  // Main Address
  @IsOptional()
  @IsString()
  @MaxLength(255)
  street?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  street2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  zip?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  country?: string;
}

export class UpdateCustomerDto {
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
  @IsString()
  @MaxLength(160)
  company?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(PHONE_PATTERN)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  jobPosition?: string | null;

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(255)
  website?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @Matches(GSTIN_PATTERN)
  gstin?: string | null;

  // Sales
  @IsOptional()
  @IsUUID()
  salespersonId?: string | null;

  @IsOptional()
  @IsUUID()
  paymentTermId?: string | null;

  @IsOptional()
  @IsUUID()
  paymentMethodId?: string | null;

  @IsOptional()
  @IsUUID()
  fiscalPositionId?: string | null;

  @IsOptional()
  @IsUUID()
  industryId?: string | null;

  // Main Address
  @IsOptional()
  @IsString()
  @MaxLength(255)
  street?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  street2?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  zip?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  state?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  country?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
