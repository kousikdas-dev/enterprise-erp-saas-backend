-- Inventory Design v4, Phase B — introduces the Opening Stock document
-- (OpeningStock/OpeningStockLine/OpeningStockActiveLine) and two additive
-- StockMovement columns needed for its reversal safeguards. Purely additive
-- — no existing table, column, or enum value is dropped or altered
-- destructively. Existing OPENING StockMovement rows created via the
-- generic /stock-adjustments endpoint (pre-Phase-B) are left completely
-- untouched by this migration; no synthetic OpeningStock document is
-- fabricated for them.

-- CreateEnum
CREATE TYPE "OpeningStockStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');

-- ============================================================================
-- StockMovement.reversesMovementId
-- Nullable self-reference set only on a reversal movement; the unique index
-- below is the DB-level guarantee that a given original movement can never
-- acquire a second reversal (Postgres unique indexes treat NULL as distinct
-- from every other NULL, so ordinary, non-reversal movements are
-- unaffected).
-- ============================================================================

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN "reversesMovementId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_reversesMovementId_key" ON "stock_movements"("reversesMovementId");

-- ============================================================================
-- StockMovement.sequenceNumber
-- Deliberately NOT a single-step `BIGSERIAL NOT NULL` column addition: that
-- would let Postgres backfill existing rows in whatever internal row-scan
-- order the table happens to have, which is not guaranteed to match
-- createdAt order. Instead: add nullable -> backfill deterministically by
-- (createdAt ASC, id ASC) -> enforce NOT NULL -> create the sequence seeded
-- past the backfilled maximum -> attach it as the column default for all
-- future inserts. For any two rows sharing an identical createdAt value,
-- "id ASC" is only an arbitrary, deterministic tie-breaker — it does not
-- claim to reconstruct which of them was actually created first in the real
-- world; that is not recoverable from the data available. This has no
-- bearing on Opening Stock's own correctness: every OpeningStock document is
-- created only after this migration runs, so every OPENING movement it
-- produces receives a real-time value from the live sequence, strictly
-- greater than every backfilled legacy value and never tied with anything.
-- ============================================================================

-- Step 1: add nullable, no default yet.
ALTER TABLE "stock_movements" ADD COLUMN "sequenceNumber" BIGINT;

-- Step 2: deterministic backfill for existing rows.
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "stock_movements"
)
UPDATE "stock_movements" sm
SET "sequenceNumber" = ordered.rn
FROM ordered
WHERE sm.id = ordered.id;

-- Step 3: enforce NOT NULL now that every existing row has a value.
ALTER TABLE "stock_movements" ALTER COLUMN "sequenceNumber" SET NOT NULL;

-- Step 4: create the sequence backing future inserts, seeded past the
-- backfilled maximum (setval's two-argument form makes the NEXT nextval()
-- call return value + 1, i.e. exactly "MAX + 1").
CREATE SEQUENCE "stock_movements_sequenceNumber_seq" OWNED BY "stock_movements"."sequenceNumber";
SELECT setval('"stock_movements_sequenceNumber_seq"', COALESCE((SELECT MAX("sequenceNumber") FROM "stock_movements"), 0));
ALTER TABLE "stock_movements" ALTER COLUMN "sequenceNumber" SET DEFAULT nextval('"stock_movements_sequenceNumber_seq"');

-- Step 5: uniqueness + the composite index used by the subsequent-activity
-- reversal check.
CREATE UNIQUE INDEX "stock_movements_sequenceNumber_key" ON "stock_movements"("sequenceNumber");
CREATE INDEX "stock_movements_tenantId_productId_warehouseId_sequenceNu_idx" ON "stock_movements"("tenantId", "productId", "warehouseId", "sequenceNumber");

-- ============================================================================
-- Opening Stock document
-- ============================================================================

-- CreateTable
CREATE TABLE "opening_stocks" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "status" "OpeningStockStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "postedAt" TIMESTAMP(3),
    "postedBy" UUID,
    "reversedAt" TIMESTAMP(3),
    "reversedBy" UUID,
    "reversalReason" TEXT,
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opening_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opening_stock_lines" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "openingStockId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "quantity" DECIMAL(19,6) NOT NULL,
    "unitOfMeasureId" UUID NOT NULL,
    "uomCode" TEXT NOT NULL,
    "uomName" TEXT NOT NULL,
    "conversionFactor" DECIMAL(19,6) NOT NULL,
    "baseQuantity" DECIMAL(19,6) NOT NULL,
    "stockMovementId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opening_stock_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable: duplicate-opening guard — see model doc-comment in schema.prisma.
CREATE TABLE "opening_stock_active_lines" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "openingStockId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opening_stock_active_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "opening_stocks_tenantId_idx" ON "opening_stocks"("tenantId");
CREATE INDEX "opening_stocks_tenantId_status_idx" ON "opening_stocks"("tenantId", "status");
CREATE UNIQUE INDEX "opening_stocks_tenantId_documentNumber_key" ON "opening_stocks"("tenantId", "documentNumber");

CREATE INDEX "opening_stock_lines_tenantId_idx" ON "opening_stock_lines"("tenantId");
CREATE INDEX "opening_stock_lines_openingStockId_idx" ON "opening_stock_lines"("openingStockId");
CREATE INDEX "opening_stock_lines_productId_idx" ON "opening_stock_lines"("productId");
CREATE INDEX "opening_stock_lines_warehouseId_idx" ON "opening_stock_lines"("warehouseId");
CREATE UNIQUE INDEX "opening_stock_lines_tenantId_openingStockId_productId_ware_key" ON "opening_stock_lines"("tenantId", "openingStockId", "productId", "warehouseId");

CREATE INDEX "opening_stock_active_lines_openingStockId_idx" ON "opening_stock_active_lines"("openingStockId");
CREATE UNIQUE INDEX "opening_stock_active_lines_tenantId_productId_warehouseId_key" ON "opening_stock_active_lines"("tenantId", "productId", "warehouseId");

-- AddForeignKey
ALTER TABLE "opening_stock_lines" ADD CONSTRAINT "opening_stock_lines_openingStockId_fkey" FOREIGN KEY ("openingStockId") REFERENCES "opening_stocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
