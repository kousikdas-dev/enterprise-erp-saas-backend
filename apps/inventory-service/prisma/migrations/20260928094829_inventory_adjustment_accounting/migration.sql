-- Phase 3.15 (Inventory Adjustment Accounting) — additive only. Adds two
-- posting-status enums and their corresponding cache columns:
--   * OpeningStock gets accountingPostingStatus/journalEntryId/
--     reversalJournalEntryId (mirrors GoodsReceipt's exact four-state
--     shape — Opening Stock has a reversal lifecycle).
--   * StockMovement gets accountingPostingStatus/journalEntryId (mirrors
--     Shipment's narrower three-state shape — populated only for
--     ADJUSTMENT_IN/ADJUSTMENT_OUT movements created via
--     StockService.adjust(); every other movement type, including the
--     ADJUSTMENT_OUT movements OpeningStockService.reverse() creates
--     internally, leaves these at their defaults).
-- No existing column, table, or row is altered or dropped.

-- CreateEnum
CREATE TYPE "OpeningStockPostingStatus" AS ENUM ('NOT_POSTED', 'POSTED', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "StockMovementPostingStatus" AS ENUM ('NOT_POSTED', 'POSTED', 'FAILED');

-- AlterTable
ALTER TABLE "opening_stocks" ADD COLUMN     "accountingPostingStatus" "OpeningStockPostingStatus" NOT NULL DEFAULT 'NOT_POSTED',
ADD COLUMN     "journalEntryId" UUID,
ADD COLUMN     "reversalJournalEntryId" UUID;

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "accountingPostingStatus" "StockMovementPostingStatus" NOT NULL DEFAULT 'NOT_POSTED',
ADD COLUMN     "journalEntryId" UUID;
