/*
  Warnings:

  - Added the required column `bomQuantity` to the `boms` table without a default value. This is not possible if the table is not empty.
  - Added the required column `outputUnitOfMeasureId` to the `boms` table without a default value. This is not possible if the table is not empty.
  - Added the required column `outputUomCode` to the `boms` table without a default value. This is not possible if the table is not empty.
  - Added the required column `outputUomName` to the `boms` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "boms" ADD COLUMN     "bomQuantity" DECIMAL(19,6) NOT NULL,
ADD COLUMN     "outputUnitOfMeasureId" UUID NOT NULL,
ADD COLUMN     "outputUomCode" TEXT NOT NULL,
ADD COLUMN     "outputUomName" TEXT NOT NULL;
