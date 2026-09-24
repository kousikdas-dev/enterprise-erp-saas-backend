import { subtractDecimals, sumDecimals } from '../../../shared/utils/decimal.util';
import { GoodsReceiptItem, PurchaseReturn } from '../models/purchase.models';

/**
 * Client-side, display-only estimate of how much of a GoodsReceiptItem can still be
 * returned: baseQuantity minus the sum of that item's own base quantity across every
 * CONFIRMED Purchase Return (DRAFT returns don't consume capacity yet — mirrors the
 * backend, which only allocates at confirm() time). This is the same total physical
 * cap inventory-service's own StockMovement.returnedQuantity check ultimately enforces,
 * so it's exact for the "already returned in total" question — it just can't preview
 * the backend's internal unmatched/matched split, which isn't exposed by any current
 * Gateway response. The backend remains authoritative; this is a UX hint only.
 */
export function remainingReturnableQuantity(
  item: Pick<GoodsReceiptItem, 'id' | 'baseQuantity'>,
  confirmedReturns: readonly {
    status: PurchaseReturn['status'];
    items: readonly Pick<PurchaseReturn['items'][number], 'goodsReceiptItemId' | 'baseQuantity'>[];
  }[],
): string {
  const alreadyReturned = sumDecimals(
    confirmedReturns
      .filter((r) => r.status === 'CONFIRMED')
      .flatMap((r) => r.items)
      .filter((line) => line.goodsReceiptItemId === item.id)
      .map((line) => line.baseQuantity),
    6,
  );
  return subtractDecimals(item.baseQuantity ?? '0', alreadyReturned, 6);
}
