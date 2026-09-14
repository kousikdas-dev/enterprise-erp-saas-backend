-- CreateEnum
CREATE TYPE "SupplierAddressType" AS ENUM ('BILLING', 'DISPATCH');

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "company" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "fiscalPositionId" UUID,
ADD COLUMN     "gstin" TEXT,
ADD COLUMN     "industryId" UUID,
ADD COLUMN     "jobPosition" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "paymentTermId" UUID,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "website" TEXT;

-- CreateTable
CREATE TABLE "_schema_meta" (
    "id" TEXT NOT NULL DEFAULT 'foundation',
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "_schema_meta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_addresses" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "type" "SupplierAddressType" NOT NULL,
    "name" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL,
    "phone" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_addresses_tenantId_idx" ON "supplier_addresses"("tenantId");

-- CreateIndex
CREATE INDEX "supplier_addresses_supplierId_idx" ON "supplier_addresses"("supplierId");

-- CreateIndex
CREATE INDEX "supplier_addresses_tenantId_supplierId_type_idx" ON "supplier_addresses"("tenantId", "supplierId", "type");

-- CreateIndex
CREATE INDEX "suppliers_tenantId_paymentTermId_idx" ON "suppliers"("tenantId", "paymentTermId");

-- CreateIndex
CREATE INDEX "suppliers_tenantId_fiscalPositionId_idx" ON "suppliers"("tenantId", "fiscalPositionId");

-- CreateIndex
CREATE INDEX "suppliers_tenantId_industryId_idx" ON "suppliers"("tenantId", "industryId");

-- AddForeignKey
ALTER TABLE "supplier_addresses" ADD CONSTRAINT "supplier_addresses_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
