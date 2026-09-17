-- Supplier Payment V1 (PURCHASE_MODULE_PLAN.md Section 22.9-22.10, Phase B).
--
-- Purely additive, generated verbatim via `prisma migrate diff` against the
-- live schema — one new table, no altered columns, no backfill needed.
-- No TRUNCATE, no DELETE, nothing existing dropped, renamed, or rewritten.

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "purchaseInvoiceId" UUID NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "paymentMethodId" UUID,
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_payments_tenantId_idx" ON "supplier_payments"("tenantId");

-- CreateIndex
CREATE INDEX "supplier_payments_purchaseInvoiceId_idx" ON "supplier_payments"("purchaseInvoiceId");

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "purchase_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

