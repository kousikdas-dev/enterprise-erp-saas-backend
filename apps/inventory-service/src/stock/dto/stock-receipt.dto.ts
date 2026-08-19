import { createHash } from 'node:crypto';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class StockReceiptLineDto {
  @IsUUID()
  productId!: string;

  @IsString()
  quantity!: string;
}

export class CreateStockReceiptDto {
  @IsIn(['goods_receipt'])
  referenceType!: 'goods_receipt';

  @IsUUID()
  referenceId!: string;

  @IsUUID()
  warehouseId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockReceiptLineDto)
  lines!: StockReceiptLineDto[];
}

export function stockReceiptPayloadHash(input: {
  warehouseId: string;
  lines: Array<{ productId: string; quantity: string }>;
}): string {
  const normalized = {
    warehouseId: input.warehouseId,
    lines: [...input.lines]
      .map((line) => ({
        productId: line.productId,
        quantity: String(line.quantity).trim(),
      }))
      .sort((a, b) => a.productId.localeCompare(b.productId)),
  };
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
