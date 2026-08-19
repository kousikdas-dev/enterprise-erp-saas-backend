-- CreateTable
CREATE TABLE "stock_receipt_applications" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_receipt_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_receipt_applications_tenantId_referenceType_referenceId_key"
  ON "stock_receipt_applications"("tenantId", "referenceType", "referenceId");

CREATE INDEX "stock_receipt_applications_tenantId_idx"
  ON "stock_receipt_applications"("tenantId");
