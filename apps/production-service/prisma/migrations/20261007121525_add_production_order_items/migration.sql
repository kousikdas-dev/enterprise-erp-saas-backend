-- CreateTable
CREATE TABLE "production_order_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "productionOrderId" UUID NOT NULL,
    "componentProductId" UUID NOT NULL,
    "componentProductSku" TEXT NOT NULL,
    "componentProductName" TEXT NOT NULL,
    "quantity" DECIMAL(19,6) NOT NULL,
    "unitOfMeasureId" UUID NOT NULL,
    "uomCode" TEXT NOT NULL,
    "uomName" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "production_order_items_tenantId_idx" ON "production_order_items"("tenantId");

-- CreateIndex
CREATE INDEX "production_order_items_productionOrderId_idx" ON "production_order_items"("productionOrderId");

-- CreateIndex
CREATE INDEX "production_order_items_componentProductId_idx" ON "production_order_items"("componentProductId");

-- CreateIndex
CREATE UNIQUE INDEX "production_order_items_tenantId_productionOrderId_component_key" ON "production_order_items"("tenantId", "productionOrderId", "componentProductId");

-- AddForeignKey
ALTER TABLE "production_order_items" ADD CONSTRAINT "production_order_items_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
