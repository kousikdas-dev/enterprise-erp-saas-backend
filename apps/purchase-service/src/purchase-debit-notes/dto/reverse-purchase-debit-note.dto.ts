import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReversePurchaseDebitNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
