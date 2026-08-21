-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('GOODS', 'SERVICE', 'COMBO');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "productType" "ProductType" NOT NULL DEFAULT 'GOODS',
ADD COLUMN     "trackInventory" BOOLEAN NOT NULL DEFAULT true;
