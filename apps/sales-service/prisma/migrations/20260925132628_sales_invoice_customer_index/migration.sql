-- CreateIndex
CREATE INDEX "sales_invoices_tenantId_customerId_idx" ON "sales_invoices"("tenantId", "customerId");
