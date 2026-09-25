-- CreateIndex
CREATE INDEX "purchase_invoices_tenantId_supplierId_idx" ON "purchase_invoices"("tenantId", "supplierId");
