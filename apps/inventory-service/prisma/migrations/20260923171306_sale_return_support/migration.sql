-- Phase 3.4 (Inventory Return Support) — adds SALE_RETURN as a new
-- StockMovementType, and two new columns on stock_movements:
-- originalMovementId (a soft reference, no FK, mirroring
-- reversesMovementId's own bare-column style, identifying the specific
-- original SALE movement a SALE_RETURN row returns against) and
-- returnedQuantity (a running total of quantity already returned against a
-- given movement, default 0). Purely additive — no existing enum value,
-- column, or table is touched. No accounting-service or other-service
-- changes accompany this migration.

-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'SALE_RETURN';

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "originalMovementId" UUID,
ADD COLUMN     "returnedQuantity" DECIMAL(19,6) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "stock_movements_originalMovementId_idx" ON "stock_movements"("originalMovementId");
