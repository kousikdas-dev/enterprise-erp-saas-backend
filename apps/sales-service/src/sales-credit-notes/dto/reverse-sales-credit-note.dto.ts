import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReverseSalesCreditNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
