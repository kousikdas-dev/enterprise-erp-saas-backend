-- CreateEnum
CREATE TYPE "PricelistApplyOn" AS ENUM ('ALL_PRODUCTS', 'CATEGORY', 'PRODUCT');

-- CreateEnum
CREATE TYPE "PricelistComputeMethod" AS ENUM ('FIXED_PRICE', 'DISCOUNT_PERCENT');

-- CreateTable
CREATE TABLE "pricelists" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricelists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricelist_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "pricelistId" UUID NOT NULL,
    "applyOn" "PricelistApplyOn" NOT NULL DEFAULT 'ALL_PRODUCTS',
    "categoryId" UUID,
    "productId" UUID,
    "computeMethod" "PricelistComputeMethod" NOT NULL DEFAULT 'FIXED_PRICE',
    "fixedPrice" DECIMAL(19,4),
    "discountPercent" DECIMAL(5,2),
    "minQuantity" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricelist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pricelists_tenantId_idx" ON "pricelists"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "pricelists_tenantId_name_key" ON "pricelists"("tenantId", "name");

-- CreateIndex
CREATE INDEX "pricelist_items_tenantId_idx" ON "pricelist_items"("tenantId");

-- CreateIndex
CREATE INDEX "pricelist_items_pricelistId_idx" ON "pricelist_items"("pricelistId");

-- AddForeignKey
ALTER TABLE "pricelist_items" ADD CONSTRAINT "pricelist_items_pricelistId_fkey" FOREIGN KEY ("pricelistId") REFERENCES "pricelists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
