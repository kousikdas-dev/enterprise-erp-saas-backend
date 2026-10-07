-- CreateTable
CREATE TABLE "unspsc_categories" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unspsc_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "unspsc_categories_tenantId_idx" ON "unspsc_categories"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "unspsc_categories_tenantId_code_key" ON "unspsc_categories"("tenantId", "code");

-- AlterTable
ALTER TABLE "units_of_measure" ADD COLUMN     "unspscCategoryId" UUID;

-- CreateIndex
CREATE INDEX "units_of_measure_unspscCategoryId_idx" ON "units_of_measure"("unspscCategoryId");

-- AddForeignKey
ALTER TABLE "units_of_measure" ADD CONSTRAINT "units_of_measure_unspscCategoryId_fkey" FOREIGN KEY ("unspscCategoryId") REFERENCES "unspsc_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
