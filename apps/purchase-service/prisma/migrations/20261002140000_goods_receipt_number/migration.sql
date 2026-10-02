-- AlterTable
ALTER TABLE "goods_receipts" ADD COLUMN "receiptNumber" TEXT;

-- Backfill existing rows with a sequential, tenant + year scoped number in
-- the same GRN-{year}-{000001} shape the application generates going
-- forward, ordered by creation time so the backfilled sequence lines up
-- with the order goods receipts actually occurred in and new numbers
-- continue from the right count.
WITH numbered AS (
  SELECT
    "id",
    'GRN-' || EXTRACT(YEAR FROM "createdAt")::int || '-' ||
      LPAD(
        ROW_NUMBER() OVER (
          PARTITION BY "tenantId", EXTRACT(YEAR FROM "createdAt")
          ORDER BY "createdAt", "id"
        )::text,
        6,
        '0'
      ) AS generated_number
  FROM "goods_receipts"
)
UPDATE "goods_receipts" AS gr
SET "receiptNumber" = numbered.generated_number
FROM numbered
WHERE gr."id" = numbered."id";

ALTER TABLE "goods_receipts" ALTER COLUMN "receiptNumber" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_tenantId_receiptNumber_key" ON "goods_receipts"("tenantId", "receiptNumber");
