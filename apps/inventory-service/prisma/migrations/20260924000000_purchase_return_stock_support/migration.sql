-- Phase 3.5 (Purchase Return) — adds PURCHASE_RETURN as a new
-- StockMovementType. Purely additive — no new column or table: the
-- existing originalMovementId/returnedQuantity columns added by Phase 3.4
-- (20260923171306_sale_return_support) are already generic enough to be
-- reused for this direction (see their own schema comments, which already
-- anticipated "in a later phase, PURCHASE" rows). No accounting-service or
-- other-service changes accompany this migration.

-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'PURCHASE_RETURN';
