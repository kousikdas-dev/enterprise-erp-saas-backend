-- AlterTable
ALTER TABLE "boms" ADD COLUMN     "productVariantId" UUID,
ADD COLUMN     "productVariantName" TEXT,
ADD COLUMN     "productVariantSku" TEXT;
