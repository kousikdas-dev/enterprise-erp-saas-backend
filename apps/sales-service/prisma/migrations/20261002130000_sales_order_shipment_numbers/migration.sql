-- AlterTable
ALTER TABLE "sales_orders" ADD COLUMN "orderNumber" TEXT;

-- Backfill existing rows with a sequential, tenant + year scoped number in
-- the same SO-{year}-{000001} shape the application generates going
-- forward, ordered by creation time so the backfilled sequence lines up
-- with the order sales orders actually occurred in and new numbers
-- continue from the right count.
WITH numbered AS (
  SELECT
    "id",
    'SO-' || EXTRACT(YEAR FROM "createdAt")::int || '-' ||
      LPAD(
        ROW_NUMBER() OVER (
          PARTITION BY "tenantId", EXTRACT(YEAR FROM "createdAt")
          ORDER BY "createdAt", "id"
        )::text,
        6,
        '0'
      ) AS generated_number
  FROM "sales_orders"
)
UPDATE "sales_orders" AS so
SET "orderNumber" = numbered.generated_number
FROM numbered
WHERE so."id" = numbered."id";

ALTER TABLE "sales_orders" ALTER COLUMN "orderNumber" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_tenantId_orderNumber_key" ON "sales_orders"("tenantId", "orderNumber");

-- AlterTable
ALTER TABLE "shipments" ADD COLUMN "shipmentNumber" TEXT;

-- Backfill existing rows with a sequential, tenant + year scoped number in
-- the same SH-{year}-{000001} shape the application generates going
-- forward, ordered by creation time.
WITH numbered AS (
  SELECT
    "id",
    'SH-' || EXTRACT(YEAR FROM "createdAt")::int || '-' ||
      LPAD(
        ROW_NUMBER() OVER (
          PARTITION BY "tenantId", EXTRACT(YEAR FROM "createdAt")
          ORDER BY "createdAt", "id"
        )::text,
        6,
        '0'
      ) AS generated_number
  FROM "shipments"
)
UPDATE "shipments" AS sh
SET "shipmentNumber" = numbered.generated_number
FROM numbered
WHERE sh."id" = numbered."id";

ALTER TABLE "shipments" ALTER COLUMN "shipmentNumber" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "shipments_tenantId_shipmentNumber_key" ON "shipments"("tenantId", "shipmentNumber");
