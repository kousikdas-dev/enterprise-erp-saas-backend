-- CreateEnum
CREATE TYPE "ProductionOrderStatus" AS ENUM ('DRAFT', 'PLANNED', 'RELEASED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ProductionOrderPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateTable
CREATE TABLE "production_orders" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "productId" UUID NOT NULL,
    "productSku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "bomId" UUID NOT NULL,
    "bomVersion" INTEGER NOT NULL,
    "routingId" UUID,
    "routingVersion" INTEGER,
    "plannedQuantity" DECIMAL(19,6) NOT NULL,
    "outputUnitOfMeasureId" UUID NOT NULL,
    "outputUomCode" TEXT NOT NULL,
    "outputUomName" TEXT NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "plannedStartDate" TIMESTAMP(3),
    "plannedEndDate" TIMESTAMP(3),
    "warehouseId" UUID,
    "priority" "ProductionOrderPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "ProductionOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "production_orders_tenantId_idx" ON "production_orders"("tenantId");

-- CreateIndex
CREATE INDEX "production_orders_tenantId_status_idx" ON "production_orders"("tenantId", "status");

-- CreateIndex
CREATE INDEX "production_orders_tenantId_productId_idx" ON "production_orders"("tenantId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "production_orders_tenantId_orderNumber_key" ON "production_orders"("tenantId", "orderNumber");
