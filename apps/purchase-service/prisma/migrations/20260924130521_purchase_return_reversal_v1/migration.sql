-- AlterEnum
ALTER TYPE "PurchaseReturnPostingStatus" ADD VALUE 'REVERSED';

-- AlterEnum
ALTER TYPE "PurchaseReturnStatus" ADD VALUE 'REVERSED';

-- AlterTable
ALTER TABLE "purchase_returns" ADD COLUMN     "reversalJournalEntryId" UUID,
ADD COLUMN     "reversalReason" TEXT,
ADD COLUMN     "reversedAt" TIMESTAMP(3);
