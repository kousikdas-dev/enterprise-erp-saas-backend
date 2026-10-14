-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED');

-- CreateTable
CREATE TABLE "work_orders" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "workOrderNumber" TEXT NOT NULL,
    "productionOrderId" UUID NOT NULL,
    "productionOrderNumber" TEXT NOT NULL,
    "productId" UUID NOT NULL,
    "productSku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "operationId" UUID NOT NULL,
    "operationCode" TEXT NOT NULL,
    "operationName" TEXT NOT NULL,
    "workCentreId" UUID NOT NULL,
    "workCentreCode" TEXT NOT NULL,
    "workCentreName" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "plannedDurationMinutes" INTEGER NOT NULL,
    "scheduledStartDate" TIMESTAMP(3),
    "scheduledEndDate" TIMESTAMP(3),
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_orders_tenantId_idx" ON "work_orders"("tenantId");

-- CreateIndex
CREATE INDEX "work_orders_tenantId_status_idx" ON "work_orders"("tenantId", "status");

-- CreateIndex
CREATE INDEX "work_orders_tenantId_workCentreId_idx" ON "work_orders"("tenantId", "workCentreId");

-- CreateIndex
CREATE INDEX "work_orders_productionOrderId_idx" ON "work_orders"("productionOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_tenantId_workOrderNumber_key" ON "work_orders"("tenantId", "workOrderNumber");

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
