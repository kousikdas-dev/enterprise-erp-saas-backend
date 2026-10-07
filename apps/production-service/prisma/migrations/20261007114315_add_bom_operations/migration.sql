-- CreateTable
CREATE TABLE "bom_operations" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "bomId" UUID NOT NULL,
    "operationId" UUID NOT NULL,
    "operationCode" TEXT NOT NULL,
    "operationName" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bom_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bom_operations_tenantId_idx" ON "bom_operations"("tenantId");

-- CreateIndex
CREATE INDEX "bom_operations_bomId_idx" ON "bom_operations"("bomId");

-- CreateIndex
CREATE INDEX "bom_operations_operationId_idx" ON "bom_operations"("operationId");

-- CreateIndex
CREATE UNIQUE INDEX "bom_operations_tenantId_bomId_operationId_key" ON "bom_operations"("tenantId", "bomId", "operationId");

-- AddForeignKey
ALTER TABLE "bom_operations" ADD CONSTRAINT "bom_operations_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "boms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_operations" ADD CONSTRAINT "bom_operations_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
