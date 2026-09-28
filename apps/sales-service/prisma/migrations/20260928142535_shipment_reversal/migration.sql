-- AlterEnum
ALTER TYPE "ShipmentPostingStatus" ADD VALUE 'REVERSED';

-- AlterEnum
ALTER TYPE "ShipmentStatus" ADD VALUE 'REVERSED';

-- AlterTable
ALTER TABLE "shipments" ADD COLUMN     "reversalJournalEntryId" UUID,
ADD COLUMN     "reversalReason" TEXT,
ADD COLUMN     "reversedAt" TIMESTAMP(3);
