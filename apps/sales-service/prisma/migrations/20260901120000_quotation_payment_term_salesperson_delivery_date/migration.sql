-- Add Quotation payment-term, salesperson, and delivery-date fields.
-- Master-data/identity UUIDs intentionally have no foreign keys: that data
-- belongs to separate services/databases (mirrors Customer.paymentTermId /
-- Customer.salespersonId).
ALTER TABLE "quotations"
    ADD COLUMN "paymentTermId" UUID,
    ADD COLUMN "salespersonId" UUID,
    ADD COLUMN "deliveryDate" TIMESTAMP(3);

CREATE INDEX "quotations_tenantId_paymentTermId_idx" ON "quotations"("tenantId", "paymentTermId");
CREATE INDEX "quotations_tenantId_salespersonId_idx" ON "quotations"("tenantId", "salespersonId");
