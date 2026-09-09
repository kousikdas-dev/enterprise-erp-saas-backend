/*
  Warnings:

  - Added the required column `lineSubtotal` to the `proforma_invoice_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lineSubtotal` to the `quotation_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lineSubtotal` to the `sales_invoice_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lineSubtotal` to the `sales_order_items` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "proforma_invoice_items" ADD COLUMN     "conversionFactor" DECIMAL(19,6),
ADD COLUMN     "discountAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "lineSubtotal" DECIMAL(19,4),
ADD COLUMN     "taxAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "taxCode" TEXT,
ADD COLUMN     "taxCodeId" UUID,
ADD COLUMN     "taxCodeName" TEXT,
ADD COLUMN     "unitOfMeasureId" UUID,
ADD COLUMN     "uomCode" TEXT,
ADD COLUMN     "uomName" TEXT;

-- Backfill lineSubtotal for existing rows: prior to this migration lineTotal
-- was always exactly quantity * unitPrice with no discount/tax, so it is the
-- correct historical value for lineSubtotal.
UPDATE "proforma_invoice_items" SET "lineSubtotal" = "lineTotal";

-- AlterTable
ALTER TABLE "proforma_invoice_items" ALTER COLUMN "lineSubtotal" SET NOT NULL;

-- AlterTable
ALTER TABLE "proforma_invoices" ADD COLUMN     "discountTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "taxTotal" DECIMAL(19,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "quotation_items" ADD COLUMN     "conversionFactor" DECIMAL(19,6),
ADD COLUMN     "discountAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "lineSubtotal" DECIMAL(19,4),
ADD COLUMN     "taxAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "taxCode" TEXT,
ADD COLUMN     "taxCodeId" UUID,
ADD COLUMN     "taxCodeName" TEXT,
ADD COLUMN     "unitOfMeasureId" UUID,
ADD COLUMN     "uomCode" TEXT,
ADD COLUMN     "uomName" TEXT;

-- Backfill lineSubtotal for existing rows: prior to this migration lineTotal
-- was always exactly quantity * unitPrice with no discount/tax, so it is the
-- correct historical value for lineSubtotal.
UPDATE "quotation_items" SET "lineSubtotal" = "lineTotal";

-- AlterTable
ALTER TABLE "quotation_items" ALTER COLUMN "lineSubtotal" SET NOT NULL;

-- AlterTable
ALTER TABLE "quotations" ADD COLUMN     "discountTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "taxTotal" DECIMAL(19,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sales_invoice_items" ADD COLUMN     "conversionFactor" DECIMAL(19,6),
ADD COLUMN     "discountAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "lineSubtotal" DECIMAL(19,4),
ADD COLUMN     "taxAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "taxCode" TEXT,
ADD COLUMN     "taxCodeId" UUID,
ADD COLUMN     "taxCodeName" TEXT,
ADD COLUMN     "unitOfMeasureId" UUID,
ADD COLUMN     "uomCode" TEXT,
ADD COLUMN     "uomName" TEXT;

-- Backfill lineSubtotal for existing rows: prior to this migration lineTotal
-- was always exactly quantity * unitPrice with no discount/tax, so it is the
-- correct historical value for lineSubtotal.
UPDATE "sales_invoice_items" SET "lineSubtotal" = "lineTotal";

-- AlterTable
ALTER TABLE "sales_invoice_items" ALTER COLUMN "lineSubtotal" SET NOT NULL;

-- AlterTable
ALTER TABLE "sales_invoices" ADD COLUMN     "discountTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "taxTotal" DECIMAL(19,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sales_order_items" ADD COLUMN     "conversionFactor" DECIMAL(19,6),
ADD COLUMN     "discountAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "lineSubtotal" DECIMAL(19,4),
ADD COLUMN     "taxAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "taxCode" TEXT,
ADD COLUMN     "taxCodeId" UUID,
ADD COLUMN     "taxCodeName" TEXT,
ADD COLUMN     "unitOfMeasureId" UUID,
ADD COLUMN     "uomCode" TEXT,
ADD COLUMN     "uomName" TEXT;

-- Backfill lineSubtotal for existing rows: prior to this migration lineTotal
-- was always exactly quantity * unitPrice with no discount/tax, so it is the
-- correct historical value for lineSubtotal.
UPDATE "sales_order_items" SET "lineSubtotal" = "lineTotal";

-- AlterTable
ALTER TABLE "sales_order_items" ALTER COLUMN "lineSubtotal" SET NOT NULL;

-- AlterTable
ALTER TABLE "sales_orders" ADD COLUMN     "discountTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "taxTotal" DECIMAL(19,4) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "quotation_item_tax_components" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "quotationItemId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT,
    "rate" DECIMAL(7,4) NOT NULL,
    "componentTaxAmount" DECIMAL(19,4) NOT NULL,

    CONSTRAINT "quotation_item_tax_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proforma_invoice_item_tax_components" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "proformaInvoiceItemId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT,
    "rate" DECIMAL(7,4) NOT NULL,
    "componentTaxAmount" DECIMAL(19,4) NOT NULL,

    CONSTRAINT "proforma_invoice_item_tax_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order_item_tax_components" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "salesOrderItemId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT,
    "rate" DECIMAL(7,4) NOT NULL,
    "componentTaxAmount" DECIMAL(19,4) NOT NULL,

    CONSTRAINT "sales_order_item_tax_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoice_item_tax_components" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "salesInvoiceItemId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT,
    "rate" DECIMAL(7,4) NOT NULL,
    "componentTaxAmount" DECIMAL(19,4) NOT NULL,

    CONSTRAINT "sales_invoice_item_tax_components_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quotation_item_tax_components_tenantId_idx" ON "quotation_item_tax_components"("tenantId");

-- CreateIndex
CREATE INDEX "quotation_item_tax_components_quotationItemId_idx" ON "quotation_item_tax_components"("quotationItemId");

-- CreateIndex
CREATE INDEX "proforma_invoice_item_tax_components_tenantId_idx" ON "proforma_invoice_item_tax_components"("tenantId");

-- CreateIndex
CREATE INDEX "proforma_invoice_item_tax_components_proformaInvoiceItemId_idx" ON "proforma_invoice_item_tax_components"("proformaInvoiceItemId");

-- CreateIndex
CREATE INDEX "sales_order_item_tax_components_tenantId_idx" ON "sales_order_item_tax_components"("tenantId");

-- CreateIndex
CREATE INDEX "sales_order_item_tax_components_salesOrderItemId_idx" ON "sales_order_item_tax_components"("salesOrderItemId");

-- CreateIndex
CREATE INDEX "sales_invoice_item_tax_components_tenantId_idx" ON "sales_invoice_item_tax_components"("tenantId");

-- CreateIndex
CREATE INDEX "sales_invoice_item_tax_components_salesInvoiceItemId_idx" ON "sales_invoice_item_tax_components"("salesInvoiceItemId");

-- CreateIndex
CREATE INDEX "proforma_invoice_items_tenantId_unitOfMeasureId_idx" ON "proforma_invoice_items"("tenantId", "unitOfMeasureId");

-- CreateIndex
CREATE INDEX "proforma_invoice_items_tenantId_taxCodeId_idx" ON "proforma_invoice_items"("tenantId", "taxCodeId");

-- CreateIndex
CREATE INDEX "quotation_items_tenantId_unitOfMeasureId_idx" ON "quotation_items"("tenantId", "unitOfMeasureId");

-- CreateIndex
CREATE INDEX "quotation_items_tenantId_taxCodeId_idx" ON "quotation_items"("tenantId", "taxCodeId");

-- CreateIndex
CREATE INDEX "sales_invoice_items_tenantId_unitOfMeasureId_idx" ON "sales_invoice_items"("tenantId", "unitOfMeasureId");

-- CreateIndex
CREATE INDEX "sales_invoice_items_tenantId_taxCodeId_idx" ON "sales_invoice_items"("tenantId", "taxCodeId");

-- CreateIndex
CREATE INDEX "sales_order_items_tenantId_unitOfMeasureId_idx" ON "sales_order_items"("tenantId", "unitOfMeasureId");

-- CreateIndex
CREATE INDEX "sales_order_items_tenantId_taxCodeId_idx" ON "sales_order_items"("tenantId", "taxCodeId");

-- AddForeignKey
ALTER TABLE "quotation_item_tax_components" ADD CONSTRAINT "quotation_item_tax_components_quotationItemId_fkey" FOREIGN KEY ("quotationItemId") REFERENCES "quotation_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_invoice_item_tax_components" ADD CONSTRAINT "proforma_invoice_item_tax_components_proformaInvoiceItemId_fkey" FOREIGN KEY ("proformaInvoiceItemId") REFERENCES "proforma_invoice_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_item_tax_components" ADD CONSTRAINT "sales_order_item_tax_components_salesOrderItemId_fkey" FOREIGN KEY ("salesOrderItemId") REFERENCES "sales_order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_item_tax_components" ADD CONSTRAINT "sales_invoice_item_tax_components_salesInvoiceItemId_fkey" FOREIGN KEY ("salesInvoiceItemId") REFERENCES "sales_invoice_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
