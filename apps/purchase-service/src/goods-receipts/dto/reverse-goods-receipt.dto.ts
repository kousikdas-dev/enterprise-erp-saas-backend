import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReverseGoodsReceiptDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
