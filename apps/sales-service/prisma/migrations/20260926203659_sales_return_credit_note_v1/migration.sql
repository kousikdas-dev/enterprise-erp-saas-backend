-- Sales Return / Credit Note (Phase 3.12). Purely additive:
--   - New SalesReturnStatus (DRAFT/CONFIRMED/REVERSED) and
--     SalesReturnPostingStatus (NOT_POSTED/POSTED/FAILED/REVERSED) enums,
--     mirroring PurchaseReturn's own equivalents exactly.
--   - New sales_returns / sales_return_items tables. A return item optionally
--     references a sales_invoice_item (drives revenue/tax/AR reversal)
--     and/or a shipment_item (drives inventory/COGS reversal + supplies the
--     original stock movement id) — at least one is required at the
--     application level.
--   - New nullable columns: sales_invoice_items.returnedQuantity (defaulted 0
--     for every pre-existing row, which is exactly their true state),
--     sales_invoices.amountCredited (defaulted 0), shipment_items.
--     inventoryMovementId + returnedQuantity (defaulted 0).
-- No backfill needed beyond the column defaults; no destructive changes.

-- CreateEnum
CREATE TYPE "SalesReturnStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'REVERSED');

-- CreateEnum
CREATE TYPE "SalesReturnPostingStatus" AS ENUM ('NOT_POSTED', 'POSTED', 'FAILED', 'REVERSED');

-- AlterTable
ALTER TABLE "sales_invoice_items" ADD COLUMN     "returnedQuantity" DECIMAL(19,6) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sales_invoices" ADD COLUMN     "amountCredited" DECIMAL(19,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "shipment_items" ADD COLUMN     "inventoryMovementId" UUID,
ADD COLUMN     "returnedQuantity" DECIMAL(19,6) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "sales_returns" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "salesInvoiceId" UUID NOT NULL,
    "warehouseId" UUID,
    "status" "SalesReturnStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT,
    "returnedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accountingPostingStatus" "SalesReturnPostingStatus" NOT NULL DEFAULT 'NOT_POSTED',
    "journalEntryId" UUID,
    "reversalJournalEntryId" UUID,
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,

    CONSTRAINT "sales_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_return_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "salesReturnId" UUID NOT NULL,
    "salesInvoiceItemId" UUID,
    "shipmentItemId" UUID,
    "productId" TEXT NOT NULL,
    "productSku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" DECIMAL(19,6) NOT NULL,
    "baseQuantity" DECIMAL(19,6),
    "unitPrice" DECIMAL(19,4),
    "discountPercent" DECIMAL(5,2),
    "discountAmount" DECIMAL(19,4),
    "taxCodeId" UUID,
    "taxCode" TEXT,
    "taxCodeName" TEXT,
    "taxAmount" DECIMAL(19,4),
    "lineSubtotal" DECIMAL(19,4),
    "lineTotal" DECIMAL(19,4),
    "unitCost" DECIMAL(19,4),
    "totalCost" DECIMAL(19,4),
    "inventoryMovementId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_returns_tenantId_idx" ON "sales_returns"("tenantId");

-- CreateIndex
CREATE INDEX "sales_returns_salesInvoiceId_idx" ON "sales_returns"("salesInvoiceId");

-- CreateIndex
CREATE INDEX "sales_returns_tenantId_status_idx" ON "sales_returns"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sales_returns_tenantId_returnNumber_key" ON "sales_returns"("tenantId", "returnNumber");

-- CreateIndex
CREATE INDEX "sales_return_items_tenantId_idx" ON "sales_return_items"("tenantId");

-- CreateIndex
CREATE INDEX "sales_return_items_salesReturnId_idx" ON "sales_return_items"("salesReturnId");

-- CreateIndex
CREATE INDEX "sales_return_items_salesInvoiceItemId_idx" ON "sales_return_items"("salesInvoiceItemId");

-- CreateIndex
CREATE INDEX "sales_return_items_shipmentItemId_idx" ON "sales_return_items"("shipmentItemId");

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "sales_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_salesReturnId_fkey" FOREIGN KEY ("salesReturnId") REFERENCES "sales_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_salesInvoiceItemId_fkey" FOREIGN KEY ("salesInvoiceItemId") REFERENCES "sales_invoice_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_shipmentItemId_fkey" FOREIGN KEY ("shipmentItemId") REFERENCES "shipment_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
