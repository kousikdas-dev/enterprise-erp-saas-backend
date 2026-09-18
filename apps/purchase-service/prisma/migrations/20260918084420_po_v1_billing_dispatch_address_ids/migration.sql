-- Purchase Order billing/dispatch address selection.
--
-- Purely additive: two nullable UUID columns + FKs to supplier_addresses
-- (same database, ON DELETE SET NULL — deleting a supplier address must
-- never be blocked by, or corrupt, an existing purchase order; the frozen
-- text snapshot columns supplierBillingAddress/supplierDispatchAddress are
-- unchanged and remain the source of truth for historical display). No
-- existing column is dropped, renamed, narrowed, or backfilled.

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "supplierBillingAddressId" UUID,
ADD COLUMN     "supplierDispatchAddressId" UUID;

-- CreateIndex
CREATE INDEX "purchase_orders_tenantId_supplierBillingAddressId_idx" ON "purchase_orders"("tenantId", "supplierBillingAddressId");

-- CreateIndex
CREATE INDEX "purchase_orders_tenantId_supplierDispatchAddressId_idx" ON "purchase_orders"("tenantId", "supplierDispatchAddressId");

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierBillingAddressId_fkey" FOREIGN KEY ("supplierBillingAddressId") REFERENCES "supplier_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierDispatchAddressId_fkey" FOREIGN KEY ("supplierDispatchAddressId") REFERENCES "supplier_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
