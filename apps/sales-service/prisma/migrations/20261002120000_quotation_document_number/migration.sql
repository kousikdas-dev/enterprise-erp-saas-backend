-- AlterTable
ALTER TABLE "quotations" ADD COLUMN "quotationNumber" TEXT;

-- Backfill existing rows with a sequential, tenant + year scoped number in
-- the same QT-{year}-{000001} shape the application generates going
-- forward, ordered by creation time so the backfilled sequence lines up
-- with the order quotations actually occurred in and new numbers continue
-- from the right count.
WITH numbered AS (
  SELECT
    "id",
    'QT-' || EXTRACT(YEAR FROM "createdAt")::int || '-' ||
      LPAD(
        ROW_NUMBER() OVER (
          PARTITION BY "tenantId", EXTRACT(YEAR FROM "createdAt")
          ORDER BY "createdAt", "id"
        )::text,
        6,
        '0'
      ) AS generated_number
  FROM "quotations"
)
UPDATE "quotations" AS q
SET "quotationNumber" = numbered.generated_number
FROM numbered
WHERE q."id" = numbered."id";

ALTER TABLE "quotations" ALTER COLUMN "quotationNumber" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "quotations_tenantId_quotationNumber_key" ON "quotations"("tenantId", "quotationNumber");
