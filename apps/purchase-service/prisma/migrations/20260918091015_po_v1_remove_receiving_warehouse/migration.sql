-- Removes PurchaseOrder's optional/informational Receiving Warehouse field.
-- It was never the operational destination for stock (GoodsReceipt.warehouseId
-- always was and remains that, untouched by this migration) — product
-- decision was that it added no value at the PO level. Any previously
-- stored value is dropped with the column; GoodsReceipt is unaffected.

/*
  Warnings:

  - You are about to drop the column `warehouseId` on the `purchase_orders` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "public"."purchase_orders_tenantId_warehouseId_idx";

-- AlterTable
ALTER TABLE "purchase_orders" DROP COLUMN "warehouseId";
