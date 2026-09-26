-- Sales Payment reversal (Phase 3.11). Purely additive:
--   - SalesPaymentPostingStatus gains a REVERSED value (mirrors
--     SupplierPaymentPostingStatus's existing four-value shape).
--   - New SalesPaymentStatus enum (ACTIVE/REVERSED) — a document-level
--     lifecycle SalesPayment never had before this phase.
--   - New nullable columns on sales_payments: status (defaulted ACTIVE for
--     every pre-existing row, which is exactly their true state),
--     reversalJournalEntryId, reversedAt, reversalReason — same shape as
--     SupplierPayment's own reversal columns (Phase 3.8).
-- No backfill needed beyond the column default; no destructive changes.

-- CreateEnum
CREATE TYPE "SalesPaymentStatus" AS ENUM ('ACTIVE', 'REVERSED');

-- AlterEnum
ALTER TYPE "SalesPaymentPostingStatus" ADD VALUE 'REVERSED';

-- AlterTable
ALTER TABLE "sales_payments" ADD COLUMN     "reversalJournalEntryId" UUID,
ADD COLUMN     "reversalReason" TEXT,
ADD COLUMN     "reversedAt" TIMESTAMP(3),
ADD COLUMN     "status" "SalesPaymentStatus" NOT NULL DEFAULT 'ACTIVE';
