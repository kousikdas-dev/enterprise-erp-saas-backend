-- Sales Return reversal support (Phase 3.12). Purely additive:
--   - StockMovementType gains a SALE_RETURN_REVERSAL value, mirroring
--     PURCHASE_RETURN_REVERSAL's existing shape (subtractive, undoes a
--     specific SALE_RETURN movement, sets reversesMovementId).
-- No backfill needed; no destructive changes.

-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'SALE_RETURN_REVERSAL';
