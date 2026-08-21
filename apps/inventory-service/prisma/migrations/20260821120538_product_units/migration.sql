-- CreateTable
CREATE TABLE "product_units" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "unitOfMeasureId" UUID NOT NULL,
    "conversionFactor" DECIMAL(19,6) NOT NULL,
    "sellingPrice" DECIMAL(19,4) NOT NULL,
    "costPrice" DECIMAL(19,4) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_units_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_units_tenantId_idx" ON "product_units"("tenantId");

-- CreateIndex
CREATE INDEX "product_units_productId_idx" ON "product_units"("productId");

-- CreateIndex
CREATE INDEX "product_units_unitOfMeasureId_idx" ON "product_units"("unitOfMeasureId");

-- CreateIndex
CREATE UNIQUE INDEX "product_units_tenantId_productId_unitOfMeasureId_key" ON "product_units"("tenantId", "productId", "unitOfMeasureId");

-- AddForeignKey
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_unitOfMeasureId_fkey" FOREIGN KEY ("unitOfMeasureId") REFERENCES "units_of_measure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
