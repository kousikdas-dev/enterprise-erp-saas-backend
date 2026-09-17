-- Goods Receipt V1 — UOM/product snapshot + baseQuantity (PURCHASE_MODULE_PLAN.md Section 19).
--
-- Strictly non-destructive (Section 19.8.1 / D11): no TRUNCATE, no DELETE, no
-- rewrite of existing goods_receipt_items.quantity / purchase_order_items
-- quantity / receivedQuantity, no retroactive correction of inventory-service
-- Stock/StockMovement rows. Follows the nullable -> deterministic backfill ->
-- validation -> NOT NULL strategy (Section 19.8.2, D10), applied only where
-- the actual migration history safely supports it (Section 19.8.3).

-- ============================================================================
-- Step 1 — add all eight columns nullable (generated via `prisma migrate diff`
-- against the live schema; reproduced verbatim here, not hand-edited).
-- ============================================================================
ALTER TABLE "goods_receipt_items" ADD COLUMN     "baseQuantity" DECIMAL(19,6),
ADD COLUMN     "conversionFactor" DECIMAL(19,6),
ADD COLUMN     "productId" UUID,
ADD COLUMN     "productName" TEXT,
ADD COLUMN     "productSku" TEXT,
ADD COLUMN     "unitOfMeasureId" UUID,
ADD COLUMN     "uomCode" TEXT,
ADD COLUMN     "uomName" TEXT;

-- ============================================================================
-- Step 2 — deterministic backfill from the parent purchase_order_items row.
-- Nothing here is invented: every value is copied from a column that already
-- exists on the (required, FK-guaranteed) parent PurchaseOrderItem.
-- ============================================================================

-- 2a. Product identity + UOM snapshot — copied verbatim from the parent PO
-- item for every pre-existing goods_receipt_items row. purchaseOrderItemId
-- is NOT NULL with an FK to purchase_order_items, so every row is guaranteed
-- exactly one parent to read from.
UPDATE "goods_receipt_items" gri
SET
  "productId" = poi."productId",
  "productSku" = poi."productSku",
  "productName" = poi."productName",
  "unitOfMeasureId" = poi."unitOfMeasureId",
  "uomCode" = poi."uomCode",
  "uomName" = poi."uomName",
  "conversionFactor" = poi."conversionFactor"
FROM "purchase_order_items" poi
WHERE poi.id = gri."purchaseOrderItemId"
  AND gri."productId" IS NULL;

-- 2b. baseQuantity, branch 1 — already-POSTED legacy receipts. Not an assumed
-- conversion: the pre-fix code path sent the raw `quantity` to Inventory, so
-- this truthfully reflects what Inventory actually received historically.
-- conversionFactor is left exactly as backfilled in 2a (copied from the PO
-- item, may remain NULL) — it is never set to 1 here.
UPDATE "goods_receipt_items" gri
SET "baseQuantity" = gri.quantity
FROM "goods_receipts" gr
WHERE gr.id = gri."goodsReceiptId"
  AND gr.status = 'POSTED'
  AND gri."baseQuantity" IS NULL;

-- 2c. baseQuantity, branch 2 — PENDING_STOCK legacy receipts (nothing sent to
-- Inventory yet) whose PO line has a real, frozen conversionFactor: convert.
UPDATE "goods_receipt_items" gri
SET "baseQuantity" = gri.quantity * gri."conversionFactor"
FROM "goods_receipts" gr
WHERE gr.id = gri."goodsReceiptId"
  AND gr.status = 'PENDING_STOCK'
  AND gri."baseQuantity" IS NULL
  AND gri."conversionFactor" IS NOT NULL;

-- 2d. baseQuantity, branch 3 — PENDING_STOCK legacy receipts whose PO line
-- never had a UOM selected at all (unitOfMeasureId IS NULL): no conversion
-- exists to fabricate, quantity is already base-denominated (implicit factor
-- of 1, matching PurchaseOrderItem's own "no UOM selected" convention).
UPDATE "goods_receipt_items" gri
SET "baseQuantity" = gri.quantity
FROM "goods_receipts" gr
WHERE gr.id = gri."goodsReceiptId"
  AND gr.status = 'PENDING_STOCK'
  AND gri."baseQuantity" IS NULL
  AND gri."unitOfMeasureId" IS NULL;

-- 2e. Any remaining PENDING_STOCK row (a UOM was selected on the PO line but
-- conversionFactor is unexpectedly NULL) is deliberately left with
-- baseQuantity = NULL. This is the explicitly documented safe-failure
-- strategy required by D12: never fabricate a historical conversionFactor.
-- post()/retry (see goods-receipts.service.ts) rejects a NULL baseQuantity
-- rather than guessing one. See PURCHASE_MODULE_PLAN.md §19.8.3 for the
-- audit query that lists any such rows.

-- ============================================================================
-- Step 3 — validation. Abort the whole migration (clean rollback, changes
-- nothing) if productId/productSku/productName could not be backfilled for
-- every row — this should be impossible given the FK guarantee, but is
-- checked rather than assumed.
-- ============================================================================
DO $$
DECLARE
  missing_count INTEGER;
BEGIN
  SELECT count(*) INTO missing_count
  FROM "goods_receipt_items"
  WHERE "productId" IS NULL OR "productSku" IS NULL OR "productName" IS NULL;

  IF missing_count > 0 THEN
    RAISE EXCEPTION
      'GR V1 migration aborted: % goods_receipt_items row(s) have no backfillable productId/productSku/productName (missing or orphaned parent purchase_order_item). No NOT NULL constraint applied; investigate before retrying.',
      missing_count;
  END IF;
END $$;

-- Informational only — does not abort the migration. Any row still NULL here
-- is the documented, intentional safe-failure state from step 2e; it stays
-- nullable (see the feasibility table in §19.8.3) and is left for manual
-- review via the audit query in PURCHASE_MODULE_PLAN.md §19.8.3.
DO $$
DECLARE
  null_base_count INTEGER;
BEGIN
  SELECT count(*) INTO null_base_count
  FROM "goods_receipt_items"
  WHERE "baseQuantity" IS NULL;

  IF null_base_count > 0 THEN
    RAISE NOTICE
      'GR V1 migration: % goods_receipt_items row(s) left with NULL baseQuantity (alternate-UOM PO line missing a historical conversionFactor). post()/retry will reject these rows rather than guess a conversion factor. See PURCHASE_MODULE_PLAN.md Section 19.8.3 for the audit query.',
      null_base_count;
  END IF;
END $$;

-- ============================================================================
-- Step 4 — SET NOT NULL only where the feasibility table in §19.8.3 proves it
-- safe: productId/productSku/productName have NOT NULL parent columns on
-- purchase_order_items (since 20260819120000_purchase_domain_v1 and
-- 20260913191233_purchase_order_v1_uom_discount_tax_snapshot respectively)
-- and a guaranteed FK parent, so backfill in step 2a always succeeds.
--
-- unitOfMeasureId/uomCode/uomName/conversionFactor/baseQuantity are NOT
-- tightened here: the parent UOM columns on purchase_order_items were added
-- nullable and may legitimately be NULL for a pre-UOM PO line, and
-- baseQuantity may legitimately be NULL per step 2e (D12) — see §19.8.3's
-- "deferred NOT NULL promotion" note. This is a deliberate, documented
-- limitation (PURCHASE_MODULE_PLAN.md §19.14 item 2/3), not an oversight.
-- ============================================================================
ALTER TABLE "goods_receipt_items" ALTER COLUMN "productId" SET NOT NULL;
ALTER TABLE "goods_receipt_items" ALTER COLUMN "productSku" SET NOT NULL;
ALTER TABLE "goods_receipt_items" ALTER COLUMN "productName" SET NOT NULL;
