-- AlterTable
-- poNumber is added nullable first: it must be backfilled for any
-- pre-existing rows before it can be made NOT NULL (step further below).
-- The other four columns are unconditionally nullable in the final schema,
-- so they can be added directly with no special handling.
ALTER TABLE "purchase_orders" ADD COLUMN     "buyerId" UUID,
ADD COLUMN     "expectedDeliveryDate" TIMESTAMP(3),
ADD COLUMN     "poNumber" TEXT,
ADD COLUMN     "supplierReference" TEXT,
ADD COLUMN     "warehouseId" UUID;

-- Backfill: assign a collision-safe, deterministic, tenant-scoped PO number
-- to any pre-existing row. Rows are processed in (tenantId, createdAt, id)
-- order. For each row, the smallest positive integer N is found such that
-- 'PO-' || LPAD(N, 8, '0') is not already used by ANY row in that tenant —
-- whether a pre-existing value (auto-generated-looking or custom/hand-
-- entered text) or a number just assigned to an earlier row in this same
-- pass (each row is updated immediately, so the NOT EXISTS check below sees
-- it on subsequent iterations). This can never overwrite a row that already
-- has a poNumber (the loop only selects rows WHERE "poNumber" IS NULL), can
-- never produce a duplicate within a tenant (each candidate is verified
-- against the live table before being assigned), and never touches any
-- other column.
DO $$
DECLARE
  rec RECORD;
  next_num INTEGER;
  candidate TEXT;
BEGIN
  FOR rec IN
    SELECT "id", "tenantId"
    FROM "purchase_orders"
    WHERE "poNumber" IS NULL
    ORDER BY "tenantId", "createdAt", "id"
  LOOP
    next_num := 1;
    LOOP
      candidate := 'PO-' || LPAD(next_num::text, 8, '0');
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM "purchase_orders"
        WHERE "tenantId" = rec."tenantId" AND "poNumber" = candidate
      );
      next_num := next_num + 1;
    END LOOP;
    UPDATE "purchase_orders" SET "poNumber" = candidate WHERE "id" = rec."id";
  END LOOP;
END $$;

-- Enforce NOT NULL now that every existing row (if any) has a value.
ALTER TABLE "purchase_orders" ALTER COLUMN "poNumber" SET NOT NULL;

-- CreateIndex
CREATE INDEX "purchase_orders_tenantId_buyerId_idx" ON "purchase_orders"("tenantId", "buyerId");

-- CreateIndex
CREATE INDEX "purchase_orders_tenantId_warehouseId_idx" ON "purchase_orders"("tenantId", "warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_tenantId_poNumber_key" ON "purchase_orders"("tenantId", "poNumber");
