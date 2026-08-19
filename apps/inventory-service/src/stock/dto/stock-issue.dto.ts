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
import { parsePositiveDecimal, quantityToString } from '../../common/decimal';

export class StockIssueLineDto {
  @IsUUID()
  productId!: string;

  @IsString()
  quantity!: string;
}

export class CreateStockIssueDto {
  @IsIn(['shipment'])
  referenceType!: 'shipment';

  @IsUUID()
  referenceId!: string;

  @IsUUID()
  warehouseId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockIssueLineDto)
  lines!: StockIssueLineDto[];
}

/**
 * Canonical stock application payload hash.
 * Quantities are normalized to 6 decimal places so "10" and "10.000000"
 * produce the same hash (Sales and Inventory must both use this rule).
 */
export function stockApplicationPayloadHash(input: {
  warehouseId: string;
  lines: Array<{ productId: string; quantity: string }>;
}): string {
  const normalized = {
    warehouseId: input.warehouseId,
    lines: [...input.lines]
      .map((line) => ({
        productId: line.productId,
        quantity: quantityToString(parsePositiveDecimal(line.quantity)),
      }))
      .sort((a, b) => a.productId.localeCompare(b.productId)),
  };
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
