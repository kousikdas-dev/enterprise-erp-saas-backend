import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReverseSalesPaymentDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
