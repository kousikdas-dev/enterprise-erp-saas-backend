-- Phase 4 (Unbuild Order)
-- Adds UNBUILD_ISSUE (finished-good leg, subtractive) and UNBUILD_RETURN
-- (component-return leg, additive) to StockMovementType. Always posted as a
-- paired set in one transaction by StockUnbuildPostingsService, sharing the
-- stock_receipt_applications idempotency ledger under referenceType =
-- 'unbuild_order' — no new table needed.

ALTER TYPE "StockMovementType" ADD VALUE 'UNBUILD_ISSUE';
ALTER TYPE "StockMovementType" ADD VALUE 'UNBUILD_RETURN';
