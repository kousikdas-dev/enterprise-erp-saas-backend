-- AlterEnum
ALTER TYPE "GoodsReceiptPostingStatus" ADD VALUE 'REVERSED';

-- AlterEnum
ALTER TYPE "GoodsReceiptStatus" ADD VALUE 'REVERSED';

-- AlterTable
ALTER TABLE "goods_receipts" ADD COLUMN     "reversalJournalEntryId" UUID,
ADD COLUMN     "reversalReason" TEXT,
ADD COLUMN     "reversedAt" TIMESTAMP(3);
