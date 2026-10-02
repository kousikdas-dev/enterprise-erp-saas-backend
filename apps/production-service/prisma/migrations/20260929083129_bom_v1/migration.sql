-- CreateEnum
CREATE TYPE "BomStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "_schema_meta" (
    "id" TEXT NOT NULL DEFAULT 'foundation',
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "_schema_meta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boms" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "parentProductId" UUID NOT NULL,
    "parentProductSku" TEXT NOT NULL,
    "parentProductName" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "BomStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "bomId" UUID NOT NULL,
    "componentProductId" UUID NOT NULL,
    "componentProductSku" TEXT NOT NULL,
    "componentProductName" TEXT NOT NULL,
    "quantity" DECIMAL(19,6) NOT NULL,
    "unitOfMeasureId" UUID NOT NULL,
    "uomCode" TEXT NOT NULL,
    "uomName" TEXT NOT NULL,
    "scrapPercentage" DECIMAL(5,2),
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bom_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "boms_tenantId_idx" ON "boms"("tenantId");

-- CreateIndex
CREATE INDEX "boms_tenantId_parentProductId_idx" ON "boms"("tenantId", "parentProductId");

-- CreateIndex
CREATE INDEX "boms_tenantId_parentProductId_status_idx" ON "boms"("tenantId", "parentProductId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "boms_tenantId_parentProductId_version_key" ON "boms"("tenantId", "parentProductId", "version");

-- CreateIndex
CREATE INDEX "bom_items_tenantId_idx" ON "bom_items"("tenantId");

-- CreateIndex
CREATE INDEX "bom_items_bomId_idx" ON "bom_items"("bomId");

-- CreateIndex
CREATE INDEX "bom_items_componentProductId_idx" ON "bom_items"("componentProductId");

-- CreateIndex
CREATE UNIQUE INDEX "bom_items_tenantId_bomId_componentProductId_key" ON "bom_items"("tenantId", "bomId", "componentProductId");

-- AddForeignKey
ALTER TABLE "bom_items" ADD CONSTRAINT "bom_items_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "boms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
