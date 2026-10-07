-- CreateEnum
CREATE TYPE "AttributeDisplayType" AS ENUM ('RADIO', 'SELECT', 'COLOR', 'PILLS');

-- CreateEnum
CREATE TYPE "AttributeVariantCreation" AS ENUM ('INSTANTLY', 'DYNAMICALLY', 'NEVER');

-- CreateTable
CREATE TABLE "attributes" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "displayType" "AttributeDisplayType" NOT NULL DEFAULT 'RADIO',
    "variantCreation" "AttributeVariantCreation" NOT NULL DEFAULT 'INSTANTLY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attribute_values" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "attributeId" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "extraPrice" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attribute_values_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attributes_tenantId_idx" ON "attributes"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "attributes_tenantId_name_key" ON "attributes"("tenantId", "name");

-- CreateIndex
CREATE INDEX "attribute_values_tenantId_idx" ON "attribute_values"("tenantId");

-- CreateIndex
CREATE INDEX "attribute_values_attributeId_idx" ON "attribute_values"("attributeId");

-- CreateIndex
CREATE UNIQUE INDEX "attribute_values_tenantId_attributeId_value_key" ON "attribute_values"("tenantId", "attributeId", "value");

-- AddForeignKey
ALTER TABLE "attribute_values" ADD CONSTRAINT "attribute_values_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "attributes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
