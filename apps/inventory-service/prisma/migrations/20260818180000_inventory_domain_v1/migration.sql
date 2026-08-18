-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM (
  'OPENING',
  'PURCHASE',
  'SALE',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT'
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units_of_measure" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_of_measure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" UUID NOT NULL,
    "unitOfMeasureId" UUID NOT NULL,
    "sellingPrice" DECIMAL(19,4) NOT NULL,
    "costPrice" DECIMAL(19,4) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stocks" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "quantity" DECIMAL(19,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(19,6) NOT NULL,
    "referenceType" TEXT,
    "referenceId" UUID,
    "reason" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "categories_tenantId_name_key" ON "categories"("tenantId", "name");
CREATE INDEX "categories_tenantId_idx" ON "categories"("tenantId");

CREATE UNIQUE INDEX "units_of_measure_tenantId_code_key" ON "units_of_measure"("tenantId", "code");
CREATE INDEX "units_of_measure_tenantId_idx" ON "units_of_measure"("tenantId");

CREATE UNIQUE INDEX "warehouses_tenantId_code_key" ON "warehouses"("tenantId", "code");
CREATE INDEX "warehouses_tenantId_idx" ON "warehouses"("tenantId");

CREATE UNIQUE INDEX "products_tenantId_sku_key" ON "products"("tenantId", "sku");
CREATE INDEX "products_tenantId_idx" ON "products"("tenantId");
CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");
CREATE INDEX "products_unitOfMeasureId_idx" ON "products"("unitOfMeasureId");

CREATE UNIQUE INDEX "stocks_tenantId_productId_warehouseId_key" ON "stocks"("tenantId", "productId", "warehouseId");
CREATE INDEX "stocks_tenantId_idx" ON "stocks"("tenantId");
CREATE INDEX "stocks_productId_idx" ON "stocks"("productId");
CREATE INDEX "stocks_warehouseId_idx" ON "stocks"("warehouseId");

CREATE INDEX "stock_movements_tenantId_idx" ON "stock_movements"("tenantId");
CREATE INDEX "stock_movements_tenantId_createdAt_idx" ON "stock_movements"("tenantId", "createdAt");
CREATE INDEX "stock_movements_productId_idx" ON "stock_movements"("productId");
CREATE INDEX "stock_movements_warehouseId_idx" ON "stock_movements"("warehouseId");

ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_unitOfMeasureId_fkey" FOREIGN KEY ("unitOfMeasureId") REFERENCES "units_of_measure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
