-- CreateEnum
CREATE TYPE "TaxComponentType" AS ENUM ('CGST', 'SGST', 'IGST', 'CESS', 'OTHER');

-- CreateTable
CREATE TABLE "tax_codes" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_components" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "taxCodeId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" "TaxComponentType" NOT NULL,
    "name" TEXT,
    "rate" DECIMAL(7,4) NOT NULL,
    "accountId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_components_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tax_codes_tenantId_idx" ON "tax_codes"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "tax_codes_tenantId_code_key" ON "tax_codes"("tenantId", "code");

-- CreateIndex
CREATE INDEX "tax_components_tenantId_idx" ON "tax_components"("tenantId");

-- CreateIndex
CREATE INDEX "tax_components_taxCodeId_idx" ON "tax_components"("taxCodeId");

-- CreateIndex
CREATE UNIQUE INDEX "tax_components_taxCodeId_sequence_key" ON "tax_components"("taxCodeId", "sequence");

-- AddForeignKey
ALTER TABLE "tax_components" ADD CONSTRAINT "tax_components_taxCodeId_fkey" FOREIGN KEY ("taxCodeId") REFERENCES "tax_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_components" ADD CONSTRAINT "tax_components_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
