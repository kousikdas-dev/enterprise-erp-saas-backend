-- AlterTable
ALTER TABLE "goods_receipt_items" ADD COLUMN     "productTracksInventory" BOOLEAN;

-- AlterTable
ALTER TABLE "purchase_invoice_items" ADD COLUMN     "productTracksInventory" BOOLEAN;

-- AlterTable
ALTER TABLE "purchase_order_items" ADD COLUMN     "productTracksInventory" BOOLEAN;

-- CreateTable
CREATE TABLE "purchase_invoice_goods_receipt_matches" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "goodsReceiptItemId" UUID NOT NULL,
    "matchedQuantity" DECIMAL(19,6) NOT NULL DEFAULT 0,
    "returnedQuantity" DECIMAL(19,6) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_invoice_goods_receipt_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoice_goods_receipt_matches_goodsReceiptItemId_key" ON "purchase_invoice_goods_receipt_matches"("goodsReceiptItemId");

-- CreateIndex
CREATE INDEX "purchase_invoice_goods_receipt_matches_tenantId_idx" ON "purchase_invoice_goods_receipt_matches"("tenantId");

-- AddForeignKey
ALTER TABLE "purchase_invoice_goods_receipt_matches" ADD CONSTRAINT "purchase_invoice_goods_receipt_matches_goodsReceiptItemId_fkey" FOREIGN KEY ("goodsReceiptItemId") REFERENCES "goods_receipt_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
