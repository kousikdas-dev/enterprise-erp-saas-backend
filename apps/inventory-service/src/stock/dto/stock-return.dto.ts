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
import { parsePositiveDecimal, quantityToString } from '../../common/decimal';

export class StockReturnLineDto {
  @IsUUID()
  productId!: string;

  @IsString()
  quantity!: string;

  // Phase 3.4 (Inventory Return Support) — the AUTHORITATIVE selector for
  // which original SALE movement this line returns against. StockReturnsService
  // never resolves the original movement by (referenceType, referenceId,
  // productId) — only by this id, locked and validated directly.
  @IsUUID()
  originalMovementId!: string;
}

export class CreateStockReturnDto {
  @IsIn(['sales_return'])
  referenceType!: 'sales_return';

  @IsUUID()
  referenceId!: string;

  @IsUUID()
  warehouseId!: string;

  // Optional cross-check only, never a selector: if supplied, every line's
  // resolved original movement must carry this exact referenceType, or the
  // whole request is rejected. Lets a future caller (e.g. a Sales Return
  // document) assert "this return is against shipment X" defensively,
  // without that assertion ever being how the original movement is found.
  @IsOptional()
  @IsString()
  originalReferenceType?: string;

  @IsOptional()
  @IsUUID()
  originalReferenceId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockReturnLineDto)
  lines!: StockReturnLineDto[];
}

/**
 * Canonical stock return payload hash. Quantities are normalized to 6
 * decimal places so "10" and "10.000000" produce the same hash. Includes
 * each line's originalMovementId (and the header's optional
 * originalReferenceType/Id) so a retry that supplies a DIFFERENT original
 * reference than the first call is correctly detected as a payload mismatch
 * rather than silently replayed.
 */
export function stockReturnPayloadHash(input: {
  warehouseId: string;
  originalReferenceType?: string;
  originalReferenceId?: string;
  lines: Array<{ productId: string; quantity: string; originalMovementId: string }>;
}): string {
  const normalized = {
    warehouseId: input.warehouseId,
    originalReferenceType: input.originalReferenceType ?? '',
    originalReferenceId: input.originalReferenceId ?? '',
    lines: [...input.lines]
      .map((line) => ({
        productId: line.productId,
        quantity: quantityToString(parsePositiveDecimal(line.quantity)),
        originalMovementId: line.originalMovementId,
      }))
      .sort(
        (a, b) =>
          a.productId.localeCompare(b.productId) ||
          a.originalMovementId.localeCompare(b.originalMovementId),
      ),
  };
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
