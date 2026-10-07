-- AlterTable
ALTER TABLE "products" ADD COLUMN     "templateProductId" UUID;

-- CreateTable
CREATE TABLE "product_attribute_values" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "attributeValueId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_attribute_values_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_attribute_values_tenantId_idx" ON "product_attribute_values"("tenantId");

-- CreateIndex
CREATE INDEX "product_attribute_values_productId_idx" ON "product_attribute_values"("productId");

-- CreateIndex
CREATE INDEX "product_attribute_values_attributeValueId_idx" ON "product_attribute_values"("attributeValueId");

-- CreateIndex
CREATE UNIQUE INDEX "product_attribute_values_tenantId_productId_attributeValueI_key" ON "product_attribute_values"("tenantId", "productId", "attributeValueId");

-- CreateIndex
CREATE INDEX "products_templateProductId_idx" ON "products"("templateProductId");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_templateProductId_fkey" FOREIGN KEY ("templateProductId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_attributeValueId_fkey" FOREIGN KEY ("attributeValueId") REFERENCES "attribute_values"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
