-- CreateEnum
CREATE TYPE "UnbuildOrderStatus" AS ENUM ('DRAFT', 'PROCESSING', 'DONE', 'CANCELLED');

-- CreateTable
CREATE TABLE "unbuild_orders" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "productId" UUID NOT NULL,
    "productSku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "bomId" UUID NOT NULL,
    "bomVersion" INTEGER NOT NULL,
    "quantity" DECIMAL(19,6) NOT NULL,
    "unitOfMeasureId" UUID NOT NULL,
    "uomCode" TEXT NOT NULL,
    "uomName" TEXT NOT NULL,
    "warehouseId" UUID NOT NULL,
    "sourceProductionOrderId" UUID,
    "sourceProductionOrderNumber" TEXT,
    "status" "UnbuildOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "processingStartedAt" TIMESTAMP(3),
    "processingToken" UUID,
    "unbuildDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedBy" UUID,
    "finishedGoodsMovementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unbuild_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unbuild_order_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "unbuildOrderId" UUID NOT NULL,
    "componentProductId" UUID NOT NULL,
    "componentProductSku" TEXT NOT NULL,
    "componentProductName" TEXT NOT NULL,
    "quantity" DECIMAL(19,6) NOT NULL,
    "unitOfMeasureId" UUID NOT NULL,
    "uomCode" TEXT NOT NULL,
    "uomName" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "stockMovementId" TEXT,

    CONSTRAINT "unbuild_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "unbuild_orders_tenantId_idx" ON "unbuild_orders"("tenantId");

-- CreateIndex
CREATE INDEX "unbuild_orders_tenantId_status_idx" ON "unbuild_orders"("tenantId", "status");

-- CreateIndex
CREATE INDEX "unbuild_orders_tenantId_productId_idx" ON "unbuild_orders"("tenantId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "unbuild_orders_tenantId_orderNumber_key" ON "unbuild_orders"("tenantId", "orderNumber");

-- CreateIndex
CREATE INDEX "unbuild_order_items_tenantId_idx" ON "unbuild_order_items"("tenantId");

-- CreateIndex
CREATE INDEX "unbuild_order_items_unbuildOrderId_idx" ON "unbuild_order_items"("unbuildOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "unbuild_order_items_tenantId_unbuildOrderId_componentProduc_key" ON "unbuild_order_items"("tenantId", "unbuildOrderId", "componentProductId");

-- AddForeignKey
ALTER TABLE "unbuild_order_items" ADD CONSTRAINT "unbuild_order_items_unbuildOrderId_fkey" FOREIGN KEY ("unbuildOrderId") REFERENCES "unbuild_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
