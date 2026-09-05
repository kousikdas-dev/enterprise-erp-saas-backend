import { Transform, Type } from 'class-transformer';
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

export class CreateJournalLineDto {
  @IsInt()
  @Min(1)
  lineNumber!: number;

  @IsUUID()
  accountId!: string;

  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  debitAmount!: string;

  @Transform(({ value }: { value: unknown }) => String(value))
  @IsString()
  creditAmount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class CreateJournalEntryDto {
  @IsOptional()
  @IsISO8601()
  entryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateJournalLineDto)
  lines?: CreateJournalLineDto[];
}

export class UpdateJournalEntryDto {
  @IsOptional()
  @IsISO8601()
  entryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateJournalLineDto)
  lines?: CreateJournalLineDto[];
}
