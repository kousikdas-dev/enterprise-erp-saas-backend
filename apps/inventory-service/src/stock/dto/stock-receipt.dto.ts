import { createHash } from 'node:crypto';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import {
  moneyToString,
  parseMoney,
  parsePositiveDecimal,
  quantityToString,
} from '../../common/decimal';

export class StockReceiptLineDto {
  @IsUUID()
  productId!: string;

  @IsString()
  quantity!: string;

  // Optional unit cost per BASE unit (Inventory Valuation V1, Phase 2).
  // Omitted entirely preserves pre-Phase-2 behavior: the line contributes 0
  // to Stock.totalValue. Purchase-service does not send this yet — adding it
  // here is additive/backward-compatible groundwork for a later phase.
  @IsOptional()
  @IsString()
  unitCost?: string;
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

/**
 * Canonical hash: quantities normalized to 6dp so "10" === "10.000000", and
 * (Inventory Valuation V1, Phase 2) unitCost normalized to 4dp the same way,
 * or "" when omitted — so a retry that supplies a DIFFERENT unitCost than
 * the original call is correctly detected as a payload mismatch rather than
 * silently replayed, and two calls that both omit unitCost still hash
 * identically to each other (and to every pre-Phase-2 call).
 */
export function stockReceiptPayloadHash(input: {
  warehouseId: string;
  lines: Array<{ productId: string; quantity: string; unitCost?: string }>;
}): string {
  const normalized = {
    warehouseId: input.warehouseId,
    lines: [...input.lines]
      .map((line) => ({
        productId: line.productId,
        quantity: quantityToString(parsePositiveDecimal(line.quantity)),
        unitCost: line.unitCost !== undefined ? moneyToString(parseMoney(line.unitCost)) : '',
      }))
      .sort((a, b) => a.productId.localeCompare(b.productId)),
  };
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
