-- Purchase Invoice V1 (PURCHASE_MODULE_PLAN.md Section 22, Phase A).
--
-- Purely additive, generated verbatim via `prisma migrate diff` against the
-- live schema — no hand-written backfill/validation steps were needed,
-- unlike 20260917120000_gr_v1_uom_snapshot: the one altered column
-- (purchase_order_items.invoicedQuantity) is NOT NULL DEFAULT 0, which is
-- safe unconditionally for any pre-existing row (0 = "never invoiced",
-- truthful for every row regardless of history, per Section 22.15's
-- explicit fallback rule) — no nullable-then-tighten dance required.
-- Every new table/column here is brand new; nothing existing is dropped,
-- renamed, narrowed, or rewritten. No TRUNCATE, no DELETE.

-- CreateEnum
CREATE TYPE "PurchaseInvoiceStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseInvoicePaymentStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID');

-- AlterTable
ALTER TABLE "purchase_order_items" ADD COLUMN     "invoicedQuantity" DECIMAL(19,6) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "purchase_invoices" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "supplierInvoiceNumber" TEXT,
    "purchaseOrderId" UUID NOT NULL,
    "status" "PurchaseInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "supplierId" UUID NOT NULL,
    "supplierName" TEXT NOT NULL,
    "supplierGstin" TEXT,
    "supplierBillingAddress" TEXT,
    "paymentTermId" UUID,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,
    "subtotal" DECIMAL(19,4) NOT NULL,
    "discountTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(19,4) NOT NULL,
    "amountPaid" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "paymentStatus" "PurchaseInvoicePaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoice_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "purchaseInvoiceId" UUID NOT NULL,
    "purchaseOrderItemId" UUID NOT NULL,
    "goodsReceiptItemId" UUID,
    "productId" UUID NOT NULL,
    "productSku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "unitOfMeasureId" UUID,
    "uomCode" TEXT,
    "uomName" TEXT,
    "conversionFactor" DECIMAL(19,6),
    "quantity" DECIMAL(19,6) NOT NULL,
    "unitCost" DECIMAL(19,4) NOT NULL,
    "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "taxCodeId" UUID,
    "taxCode" TEXT,
    "taxCodeName" TEXT,
    "taxAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "lineSubtotal" DECIMAL(19,4) NOT NULL,
    "lineTotal" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoice_item_tax_components" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "purchaseInvoiceItemId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT,
    "rate" DECIMAL(7,4) NOT NULL,
    "componentTaxAmount" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_invoice_item_tax_components_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_invoices_tenantId_idx" ON "purchase_invoices"("tenantId");

-- CreateIndex
CREATE INDEX "purchase_invoices_purchaseOrderId_idx" ON "purchase_invoices"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "purchase_invoices_tenantId_status_idx" ON "purchase_invoices"("tenantId", "status");

-- CreateIndex
CREATE INDEX "purchase_invoices_tenantId_paymentTermId_idx" ON "purchase_invoices"("tenantId", "paymentTermId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoices_tenantId_invoiceNumber_key" ON "purchase_invoices"("tenantId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "purchase_invoice_items_tenantId_idx" ON "purchase_invoice_items"("tenantId");

-- CreateIndex
CREATE INDEX "purchase_invoice_items_purchaseInvoiceId_idx" ON "purchase_invoice_items"("purchaseInvoiceId");

-- CreateIndex
CREATE INDEX "purchase_invoice_items_purchaseOrderItemId_idx" ON "purchase_invoice_items"("purchaseOrderItemId");

-- CreateIndex
CREATE INDEX "purchase_invoice_items_goodsReceiptItemId_idx" ON "purchase_invoice_items"("goodsReceiptItemId");

-- CreateIndex
CREATE INDEX "purchase_invoice_item_tax_components_tenantId_idx" ON "purchase_invoice_item_tax_components"("tenantId");

-- CreateIndex
CREATE INDEX "purchase_invoice_item_tax_components_purchaseInvoiceItemId_idx" ON "purchase_invoice_item_tax_components"("purchaseInvoiceItemId");

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_items" ADD CONSTRAINT "purchase_invoice_items_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "purchase_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_items" ADD CONSTRAINT "purchase_invoice_items_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "purchase_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_items" ADD CONSTRAINT "purchase_invoice_items_goodsReceiptItemId_fkey" FOREIGN KEY ("goodsReceiptItemId") REFERENCES "goods_receipt_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_item_tax_components" ADD CONSTRAINT "purchase_invoice_item_tax_components_purchaseInvoiceItemId_fkey" FOREIGN KEY ("purchaseInvoiceItemId") REFERENCES "purchase_invoice_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

