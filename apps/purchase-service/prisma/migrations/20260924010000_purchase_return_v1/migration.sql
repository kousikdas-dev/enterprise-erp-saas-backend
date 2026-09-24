-- Purchase Return V1 (Phase 3.5). Purely additive, generated verbatim via
-- `prisma migrate diff` against the live schema — no hand-written
-- backfill/validation steps needed.
--
-- New tables: purchase_returns (header, scoped to exactly one GoodsReceipt),
-- purchase_return_items (one row per returned receipt line, snapshot
-- fields), purchase_return_item_allocations (write-once historical record
-- of how each item's quantity split between the UNMATCHED_RECEIPT and
-- MATCHED_INVOICE cost buckets — never updated after creation, not even by
-- the future Phase 3.6 reversal).
--
-- New columns on existing tables — two DELIBERATELY SEPARATE counters, not
-- one shared "returnedQuantity", because a single counter cannot correctly
-- serve both cost buckets at once (see each column's own schema comment for
-- the full reasoning):
--   goods_receipt_items.unmatchedReturnedQuantity — base qty returned from
--     the never-invoiced bucket only. Bound: matchedQuantity (from the
--     sibling purchase_invoice_goods_receipt_matches row, 0 if none) +
--     unmatchedReturnedQuantity <= baseQuantity.
--   goods_receipt_items.inventoryMovementId — soft reference (no FK) to the
--     inventory-service StockMovement (type PURCHASE) created when this
--     receipt line was posted; the AUTHORITATIVE originalMovementId a
--     Purchase Return sends to inventory-service's stock-returns endpoint.
--   purchase_invoice_items.returnedQuantity — base qty of THIS invoice
--     line's own slice consumed by MATCHED_INVOICE allocations. Bound:
--     returnedQuantity <= quantity x conversionFactor.
--
-- purchase_invoice_goods_receipt_matches.matchedQuantity is UNCHANGED by
-- this migration and by Purchase Return itself — it remains permanent with
-- respect to returns (only invoice cancellation still decrements it); its
-- existing returnedQuantity column is narrowed in meaning (application-code
-- only, no schema change) to the matched bucket, bounded by
-- returnedQuantity <= matchedQuantity. See that model's updated schema
-- comment for the full explanation.

-- CreateEnum
CREATE TYPE "PurchaseReturnStatus" AS ENUM ('DRAFT', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "PurchaseReturnPostingStatus" AS ENUM ('NOT_POSTED', 'POSTED', 'FAILED');

-- CreateEnum
CREATE TYPE "PurchaseReturnAllocationType" AS ENUM ('UNMATCHED_RECEIPT', 'MATCHED_INVOICE');

-- AlterTable
ALTER TABLE "goods_receipt_items" ADD COLUMN     "inventoryMovementId" UUID,
ADD COLUMN     "unmatchedReturnedQuantity" DECIMAL(19,6) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "purchase_invoice_items" ADD COLUMN     "returnedQuantity" DECIMAL(19,6) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "purchase_returns" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "goodsReceiptId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "status" "PurchaseReturnStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT,
    "returnedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accountingPostingStatus" "PurchaseReturnPostingStatus" NOT NULL DEFAULT 'NOT_POSTED',
    "journalEntryId" UUID,

    CONSTRAINT "purchase_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_return_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "purchaseReturnId" UUID NOT NULL,
    "goodsReceiptItemId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "productSku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "unitOfMeasureId" UUID,
    "uomCode" TEXT,
    "uomName" TEXT,
    "conversionFactor" DECIMAL(19,6),
    "quantity" DECIMAL(19,6) NOT NULL,
    "baseQuantity" DECIMAL(19,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_return_item_allocations" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "purchaseReturnItemId" UUID NOT NULL,
    "allocationType" "PurchaseReturnAllocationType" NOT NULL,
    "purchaseInvoiceItemId" UUID,
    "baseQuantity" DECIMAL(19,6) NOT NULL,
    "receiptUnitCost" DECIMAL(19,4) NOT NULL,
    "receiptCostAmount" DECIMAL(19,4) NOT NULL,
    "invoiceUnitCost" DECIMAL(19,4),
    "invoiceCostAmount" DECIMAL(19,4),
    "ppvAmount" DECIMAL(19,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_return_item_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_returns_tenantId_idx" ON "purchase_returns"("tenantId");

-- CreateIndex
CREATE INDEX "purchase_returns_goodsReceiptId_idx" ON "purchase_returns"("goodsReceiptId");

-- CreateIndex
CREATE INDEX "purchase_returns_tenantId_status_idx" ON "purchase_returns"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_returns_tenantId_returnNumber_key" ON "purchase_returns"("tenantId", "returnNumber");

-- CreateIndex
CREATE INDEX "purchase_return_items_tenantId_idx" ON "purchase_return_items"("tenantId");

-- CreateIndex
CREATE INDEX "purchase_return_items_purchaseReturnId_idx" ON "purchase_return_items"("purchaseReturnId");

-- CreateIndex
CREATE INDEX "purchase_return_items_goodsReceiptItemId_idx" ON "purchase_return_items"("goodsReceiptItemId");

-- CreateIndex
CREATE INDEX "purchase_return_item_allocations_tenantId_idx" ON "purchase_return_item_allocations"("tenantId");

-- CreateIndex
CREATE INDEX "purchase_return_item_allocations_purchaseReturnItemId_idx" ON "purchase_return_item_allocations"("purchaseReturnItemId");

-- CreateIndex
CREATE INDEX "purchase_return_item_allocations_purchaseInvoiceItemId_idx" ON "purchase_return_item_allocations"("purchaseInvoiceItemId");

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "goods_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_purchaseReturnId_fkey" FOREIGN KEY ("purchaseReturnId") REFERENCES "purchase_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_goodsReceiptItemId_fkey" FOREIGN KEY ("goodsReceiptItemId") REFERENCES "goods_receipt_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_item_allocations" ADD CONSTRAINT "purchase_return_item_allocations_purchaseReturnItemId_fkey" FOREIGN KEY ("purchaseReturnItemId") REFERENCES "purchase_return_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_item_allocations" ADD CONSTRAINT "purchase_return_item_allocations_purchaseInvoiceItemId_fkey" FOREIGN KEY ("purchaseInvoiceItemId") REFERENCES "purchase_invoice_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
