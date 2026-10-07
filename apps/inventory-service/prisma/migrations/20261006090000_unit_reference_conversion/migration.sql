-- AlterTable
ALTER TABLE "units_of_measure" ADD COLUMN     "referenceUnitId" UUID,
ADD COLUMN     "conversionFactor" DECIMAL(19,6);

-- CreateIndex
CREATE INDEX "units_of_measure_referenceUnitId_idx" ON "units_of_measure"("referenceUnitId");

-- AddForeignKey
ALTER TABLE "units_of_measure" ADD CONSTRAINT "units_of_measure_referenceUnitId_fkey" FOREIGN KEY ("referenceUnitId") REFERENCES "units_of_measure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
