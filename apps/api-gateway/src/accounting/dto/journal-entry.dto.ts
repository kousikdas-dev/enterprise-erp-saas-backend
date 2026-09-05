import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateJournalLineDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  lineNumber!: number;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  accountId!: string;

  @ApiProperty({ example: '100.00' })
  @IsString()
  debitAmount!: string;

  @ApiProperty({ example: '0' })
  @IsString()
  creditAmount!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class CreateJournalEntryDto {
  @ApiPropertyOptional({ description: 'ISO 8601 date; defaults to today' })
  @IsOptional()
  @IsISO8601()
  entryDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    type: [CreateJournalLineDto],
    description: 'A DRAFT entry may start with zero lines',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateJournalLineDto)
  lines?: CreateJournalLineDto[];
}

export class UpdateJournalEntryDto {
  @ApiPropertyOptional({ description: 'ISO 8601 date' })
  @IsOptional()
  @IsISO8601()
  entryDate?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional({
    type: [CreateJournalLineDto],
    description:
      "When provided, replaces the entry's entire line set. Only allowed while DRAFT.",
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateJournalLineDto)
  lines?: CreateJournalLineDto[];
}

export class JournalLineAccountDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;
}

export class JournalLineDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'uuid' })
  journalEntryId!: string;

  @ApiProperty()
  lineNumber!: number;

  @ApiProperty({ format: 'uuid' })
  accountId!: string;

  @ApiProperty({ type: JournalLineAccountDto })
  account!: JournalLineAccountDto;

  @ApiProperty()
  debitAmount!: string;

  @ApiProperty()
  creditAmount!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class JournalEntryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty()
  entryNumber!: string;

  @ApiProperty()
  entryDate!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty({ enum: ['DRAFT', 'POSTED', 'VOID'] })
  status!: 'DRAFT' | 'POSTED' | 'VOID';

  @ApiPropertyOptional({ nullable: true })
  postedAt!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;

  @ApiProperty({ type: [JournalLineDto] })
  lines!: JournalLineDto[];
}

export class JournalEntryListDto {
  @ApiProperty({ type: [JournalEntryDto] })
  items!: JournalEntryDto[];
}
