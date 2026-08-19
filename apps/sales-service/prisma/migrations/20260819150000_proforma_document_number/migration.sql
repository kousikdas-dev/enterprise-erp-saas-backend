-- AlterTable
ALTER TABLE "proforma_invoices" ADD COLUMN "documentNumber" TEXT;

UPDATE "proforma_invoices"
SET "documentNumber" = 'PF-' || REPLACE("id"::text, '-', '')
WHERE "documentNumber" IS NULL;

ALTER TABLE "proforma_invoices" ALTER COLUMN "documentNumber" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "proforma_invoices_tenantId_documentNumber_key" ON "proforma_invoices"("tenantId", "documentNumber");
