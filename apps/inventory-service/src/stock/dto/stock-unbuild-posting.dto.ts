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

export class UnbuildPostingLineDto {
  @IsUUID()
  productId!: string;

  // Always in the product's BASE unit — production-service is responsible
  // for re-validating this against current Inventory product data before
  // calling here (see UnbuildOrdersService.complete()). This endpoint, like
  // CreateStockReceiptDto/CreateStockIssueDto, carries no UOM field at all:
  // there is no conversion math anywhere in this codebase, so a quantity
  // that reaches here is trusted to already be base-unit.
  @IsString()
  quantity!: string;
}

export class CreateUnbuildPostingDto {
  @IsIn(['unbuild_order'])
  referenceType!: 'unbuild_order';

  @IsUUID()
  referenceId!: string;

  @IsUUID()
  warehouseId!: string;

  @ValidateNested()
  @Type(() => UnbuildPostingLineDto)
  finishedGood!: UnbuildPostingLineDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UnbuildPostingLineDto)
  components!: UnbuildPostingLineDto[];
}

/**
 * Canonical hash, same shape as stockReceiptPayloadHash/
 * stockApplicationPayloadHash: quantities normalized to 6dp, lines sorted by
 * productId so the hash does not depend on array order. The finished-good
 * line and every component line are combined into one sorted array, tagged
 * with `role` so the (normally disjoint) finished-good product and a
 * component product can never collide under sorting even in the
 * degenerate case where they happen to be the same product.
 */
export function unbuildPostingPayloadHash(input: {
  warehouseId: string;
  finishedGood: { productId: string; quantity: string };
  components: Array<{ productId: string; quantity: string }>;
}): string {
  const normalized = {
    warehouseId: input.warehouseId,
    lines: [
      { role: 'issue', productId: input.finishedGood.productId, quantity: input.finishedGood.quantity },
      ...input.components.map((line) => ({
        role: 'return' as const,
        productId: line.productId,
        quantity: line.quantity,
      })),
    ]
      .map((line) => ({
        role: line.role,
        productId: line.productId,
        quantity: quantityToString(parsePositiveDecimal(line.quantity)),
      }))
      .sort((a, b) => (a.role + a.productId).localeCompare(b.role + b.productId)),
  };
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
