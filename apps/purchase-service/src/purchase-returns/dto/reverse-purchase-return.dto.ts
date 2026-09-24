import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReversePurchaseReturnDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
