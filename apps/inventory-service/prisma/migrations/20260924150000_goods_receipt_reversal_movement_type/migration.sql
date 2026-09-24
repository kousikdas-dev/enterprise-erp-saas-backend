-- Phase 3.7 (Goods Receipt reversal) — adds PURCHASE_REVERSAL as a new
-- StockMovementType. Purely additive — no new column or table: the
-- existing originalMovementId/returnedQuantity/reversesMovementId columns
-- are already generic enough to be reused for this direction (see their own
-- schema comments). No accounting-service or other-service changes
-- accompany this migration.

-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'PURCHASE_REVERSAL';
