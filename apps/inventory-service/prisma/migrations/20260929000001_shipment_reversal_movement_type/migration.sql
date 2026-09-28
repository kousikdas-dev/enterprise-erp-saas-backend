-- Phase 3.16 (Shipment Cancellation / COGS Reversal)
-- Adds SALE_REVERSAL to StockMovementType: undoes a specific, identified
-- SALE movement directly (the root shipment-issue movement), additive,
-- costed at that SALE movement's own unitCost verbatim. Mirrors
-- PURCHASE_REVERSAL's exact structure (Phase 3.7) with the direction
-- inverted, since SALE is subtractive where PURCHASE is additive.

ALTER TYPE "StockMovementType" ADD VALUE 'SALE_REVERSAL';
