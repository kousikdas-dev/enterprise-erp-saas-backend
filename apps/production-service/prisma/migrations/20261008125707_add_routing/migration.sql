-- CreateEnum
CREATE TYPE "RoutingStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "routings" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "productSku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "RoutingStatus" NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routing_steps" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "routingId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "operationId" UUID NOT NULL,
    "operationCode" TEXT NOT NULL,
    "operationName" TEXT NOT NULL,
    "workCentreId" UUID NOT NULL,
    "workCentreCode" TEXT NOT NULL,
    "workCentreName" TEXT NOT NULL,
    "setupMinutes" INTEGER NOT NULL DEFAULT 0,
    "runMinutesPerUnit" DECIMAL(19,6) NOT NULL DEFAULT 0,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routing_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "routings_tenantId_idx" ON "routings"("tenantId");

-- CreateIndex
CREATE INDEX "routings_tenantId_productId_idx" ON "routings"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "routings_tenantId_productId_status_idx" ON "routings"("tenantId", "productId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "routings_tenantId_productId_version_key" ON "routings"("tenantId", "productId", "version");

-- CreateIndex
CREATE INDEX "routing_steps_tenantId_idx" ON "routing_steps"("tenantId");

-- CreateIndex
CREATE INDEX "routing_steps_routingId_idx" ON "routing_steps"("routingId");

-- CreateIndex
CREATE INDEX "routing_steps_operationId_idx" ON "routing_steps"("operationId");

-- CreateIndex
CREATE INDEX "routing_steps_workCentreId_idx" ON "routing_steps"("workCentreId");

-- CreateIndex
CREATE UNIQUE INDEX "routing_steps_tenantId_routingId_sequence_key" ON "routing_steps"("tenantId", "routingId", "sequence");

-- AddForeignKey
ALTER TABLE "routing_steps" ADD CONSTRAINT "routing_steps_routingId_fkey" FOREIGN KEY ("routingId") REFERENCES "routings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_steps" ADD CONSTRAINT "routing_steps_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_steps" ADD CONSTRAINT "routing_steps_workCentreId_fkey" FOREIGN KEY ("workCentreId") REFERENCES "work_centres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
