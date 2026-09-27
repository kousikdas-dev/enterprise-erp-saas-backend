import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReverseSalesReturnDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
