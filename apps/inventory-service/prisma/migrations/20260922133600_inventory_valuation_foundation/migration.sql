-- Inventory Valuation V1 (Phase 2) — Moving/Weighted Average foundation.
-- Adds cost/value fields to the existing Stock, StockMovement and
-- OpeningStockLine tables only — no new table, no FIFO/cost-layer model, no
-- Standard Cost. Purely additive: every new column is either NOT NULL with
-- a 0 default (Stock.totalValue) or nullable (StockMovement.unitCost/
-- totalCost, OpeningStockLine.unitCost), so every pre-Phase-2 row and every
-- caller that omits cost information is completely unaffected.
--
-- Applied via `prisma migrate deploy` rather than `migrate dev`: replaying
-- full migration history against an empty shadow database (which `migrate
-- dev` requires) hits a pre-existing, unrelated bug in migration
-- 20260921134320_opening_stock — its sequenceNumber backfill does
-- `SELECT setval(seq, COALESCE(MAX("sequenceNumber"), 0))`, and
-- `setval(seq, 0)` is rejected by Postgres (sequences have minvalue 1) when
-- stock_movements is empty, which is only ever true on a fresh shadow copy
-- (the real database already has rows and was never affected). That
-- migration is left untouched here — fixing a pre-existing, unrelated
-- migration is out of this phase's scope — and is called out separately in
-- the Phase 2 report.

-- AlterTable
ALTER TABLE "stocks" ADD COLUMN     "totalValue" DECIMAL(19,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "unitCost" DECIMAL(19,4),
ADD COLUMN     "totalCost" DECIMAL(19,4);

-- AlterTable
ALTER TABLE "opening_stock_lines" ADD COLUMN     "unitCost" DECIMAL(19,4);
