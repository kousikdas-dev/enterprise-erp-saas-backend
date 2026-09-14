/*
  Warnings:

  - Added the required column `lineSubtotal` to the `purchase_order_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lineTotal` to the `purchase_order_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `productName` to the `purchase_order_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `productSku` to the `purchase_order_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `subtotal` to the `purchase_orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `supplierName` to the `purchase_orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `total` to the `purchase_orders` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "purchase_order_items" ADD COLUMN     "conversionFactor" DECIMAL(19,6),
ADD COLUMN     "discountAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "lineSubtotal" DECIMAL(19,4) NOT NULL,
ADD COLUMN     "lineTotal" DECIMAL(19,4) NOT NULL,
ADD COLUMN     "productName" TEXT NOT NULL,
ADD COLUMN     "productSku" TEXT NOT NULL,
ADD COLUMN     "taxAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "taxCode" TEXT,
ADD COLUMN     "taxCodeId" UUID,
ADD COLUMN     "taxCodeName" TEXT,
ADD COLUMN     "unitOfMeasureId" UUID,
ADD COLUMN     "uomCode" TEXT,
ADD COLUMN     "uomName" TEXT;

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "discountTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "paymentTermId" UUID,
ADD COLUMN     "subtotal" DECIMAL(19,4) NOT NULL,
ADD COLUMN     "supplierBillingAddress" TEXT,
ADD COLUMN     "supplierDispatchAddress" TEXT,
ADD COLUMN     "supplierGstin" TEXT,
ADD COLUMN     "supplierName" TEXT NOT NULL,
ADD COLUMN     "taxTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "total" DECIMAL(19,4) NOT NULL;

-- CreateTable
CREATE TABLE "purchase_order_item_tax_components" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "purchaseOrderItemId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT,
    "rate" DECIMAL(7,4) NOT NULL,
    "componentTaxAmount" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_item_tax_components_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_order_item_tax_components_tenantId_idx" ON "purchase_order_item_tax_components"("tenantId");

-- CreateIndex
CREATE INDEX "purchase_order_item_tax_components_purchaseOrderItemId_idx" ON "purchase_order_item_tax_components"("purchaseOrderItemId");

-- CreateIndex
CREATE INDEX "purchase_orders_tenantId_paymentTermId_idx" ON "purchase_orders"("tenantId", "paymentTermId");

-- AddForeignKey
ALTER TABLE "purchase_order_item_tax_components" ADD CONSTRAINT "purchase_order_item_tax_components_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "purchase_order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
