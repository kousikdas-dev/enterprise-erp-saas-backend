-- Sales Invoice: a new accounting-relevant document sourced from a Sales
-- Order or a Proforma Invoice (or created directly). paymentTermId and
-- salespersonId are master-data/identity UUIDs and intentionally have no
-- foreign keys, mirroring Quotation.paymentTermId / Quotation.salespersonId.
-- CreateEnum
CREATE TYPE "SalesInvoiceSourceType" AS ENUM ('SALES_ORDER', 'PROFORMA_INVOICE');

-- CreateEnum
CREATE TYPE "SalesInvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'CANCELLED');

-- CreateTable
CREATE TABLE "sales_invoices" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "sourceType" "SalesInvoiceSourceType",
    "sourceId" UUID,
    "status" "SalesInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "customerId" UUID NOT NULL,
    "customerName" TEXT NOT NULL,
    "billingAddress" TEXT,
    "shippingAddress" TEXT,
    "paymentTermId" UUID,
    "salespersonId" UUID,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,
    "subtotal" DECIMAL(19,4) NOT NULL,
    "total" DECIMAL(19,4) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoice_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "salesInvoiceId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "productSku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" DECIMAL(19,6) NOT NULL,
    "unitPrice" DECIMAL(19,4) NOT NULL,
    "lineTotal" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_invoices_tenantId_idx" ON "sales_invoices"("tenantId");

-- CreateIndex
CREATE INDEX "sales_invoices_customerId_idx" ON "sales_invoices"("customerId");

-- CreateIndex
CREATE INDEX "sales_invoices_tenantId_status_idx" ON "sales_invoices"("tenantId", "status");

-- CreateIndex
CREATE INDEX "sales_invoices_tenantId_sourceType_sourceId_idx" ON "sales_invoices"("tenantId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "sales_invoices_tenantId_paymentTermId_idx" ON "sales_invoices"("tenantId", "paymentTermId");

-- CreateIndex
CREATE INDEX "sales_invoices_tenantId_salespersonId_idx" ON "sales_invoices"("tenantId", "salespersonId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_tenantId_invoiceNumber_key" ON "sales_invoices"("tenantId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "sales_invoice_items_tenantId_idx" ON "sales_invoice_items"("tenantId");

-- CreateIndex
CREATE INDEX "sales_invoice_items_salesInvoiceId_idx" ON "sales_invoice_items"("salesInvoiceId");

-- CreateIndex
CREATE INDEX "sales_invoice_items_productId_idx" ON "sales_invoice_items"("productId");

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_items" ADD CONSTRAINT "sales_invoice_items_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "sales_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
