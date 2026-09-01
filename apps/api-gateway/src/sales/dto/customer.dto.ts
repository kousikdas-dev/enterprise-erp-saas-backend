import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { CustomerAddressDto } from './customer-address.dto';

const PHONE_PATTERN = /^[+0-9][0-9().\s-]{5,63}$/;
const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i;

export class CreateCustomerDto {
  @ApiProperty({ example: 'CUST-001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code!: string;

  @ApiProperty({ example: 'Acme Retail' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ example: 'Acme Retail Pvt. Ltd.' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  company?: string;

  @ApiPropertyOptional({ example: 'buyer@acme.example' })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ example: '+91 98765 43210' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(PHONE_PATTERN)
  phone?: string;

  @ApiPropertyOptional({ example: 'Procurement Manager' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  jobPosition?: string;

  @ApiPropertyOptional({ example: 'https://acme.example' })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(255)
  website?: string;

  @ApiPropertyOptional({ type: [String], example: ['wholesale', 'priority'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ example: '19ABCDE1234F1Z5' })
  @IsOptional()
  @IsString()
  @Matches(GSTIN_PATTERN)
  gstin?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  salespersonId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  paymentTermId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  fiscalPositionId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  industryId?: string;

  @ApiPropertyOptional({ example: '123 Main Street' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  street?: string;

  @ApiPropertyOptional({ example: 'Salt Lake' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  street2?: string;

  @ApiPropertyOptional({ example: 'Kolkata' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional({ example: '700001' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  zip?: string;

  @ApiPropertyOptional({ example: 'West Bengal' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  state?: string;

  @ApiPropertyOptional({ example: 'India' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  country?: string;
}

export class UpdateCustomerDto {
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

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  company?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(PHONE_PATTERN)
  phone?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  jobPosition?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(255)
  website?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ nullable: true, example: '19ABCDE1234F1Z5' })
  @IsOptional()
  @IsString()
  @Matches(GSTIN_PATTERN)
  gstin?: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  salespersonId?: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  paymentTermId?: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  paymentMethodId?: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  fiscalPositionId?: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  industryId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  street?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  street2?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  zip?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  state?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  country?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CustomerDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) tenantId!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) company!: string | null;
  @ApiPropertyOptional({ nullable: true }) email!: string | null;
  @ApiPropertyOptional({ nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ nullable: true }) jobPosition!: string | null;
  @ApiPropertyOptional({ nullable: true }) website!: string | null;
  @ApiProperty({ type: [String] }) tags!: string[];
  @ApiPropertyOptional({ nullable: true }) gstin!: string | null;
  @ApiPropertyOptional({ nullable: true, format: 'uuid' }) salespersonId!:
    string | null;
  @ApiPropertyOptional({ nullable: true, format: 'uuid' }) paymentTermId!:
    string | null;
  @ApiPropertyOptional({ nullable: true, format: 'uuid' }) paymentMethodId!:
    string | null;
  @ApiPropertyOptional({ nullable: true, format: 'uuid' }) fiscalPositionId!:
    string | null;
  @ApiPropertyOptional({ nullable: true, format: 'uuid' }) industryId!:
    string | null;
  @ApiPropertyOptional({ nullable: true }) street!: string | null;
  @ApiPropertyOptional({ nullable: true }) street2!: string | null;
  @ApiPropertyOptional({ nullable: true }) city!: string | null;
  @ApiPropertyOptional({ nullable: true }) zip!: string | null;
  @ApiPropertyOptional({ nullable: true }) state!: string | null;
  @ApiPropertyOptional({ nullable: true }) country!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class CustomerWithAddressesDto extends CustomerDto {
  @ApiProperty({ type: [CustomerAddressDto] })
  addresses!: CustomerAddressDto[];
}

export class CustomerListDto {
  @ApiProperty({ type: [CustomerWithAddressesDto] })
  items!: CustomerWithAddressesDto[];
}
