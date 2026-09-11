-- AlterTable
ALTER TABLE "sales_orders" ADD COLUMN     "deliveryDate" TIMESTAMP(3),
ADD COLUMN     "paymentTermId" UUID,
ADD COLUMN     "proformaInvoiceId" UUID,
ADD COLUMN     "salespersonId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_proformaInvoiceId_key" ON "sales_orders"("proformaInvoiceId");

-- CreateIndex
CREATE INDEX "sales_orders_tenantId_paymentTermId_idx" ON "sales_orders"("tenantId", "paymentTermId");

-- CreateIndex
CREATE INDEX "sales_orders_tenantId_salespersonId_idx" ON "sales_orders"("tenantId", "salespersonId");

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_proformaInvoiceId_fkey" FOREIGN KEY ("proformaInvoiceId") REFERENCES "proforma_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
