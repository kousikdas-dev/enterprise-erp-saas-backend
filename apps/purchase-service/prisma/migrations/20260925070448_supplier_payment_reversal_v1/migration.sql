-- Supplier Payment reversal (Phase 3.8). Purely additive:
--   - SupplierPaymentPostingStatus gains a REVERSED value (mirrors
--     PurchaseInvoicePostingStatus's existing four-value shape).
--   - New SupplierPaymentStatus enum (ACTIVE/REVERSED) — a document-level
--     lifecycle SupplierPayment never had before this phase.
--   - New nullable columns on supplier_payments: status (defaulted ACTIVE
--     for every pre-existing row, which is exactly their true state),
--     reversalJournalEntryId, reversedAt, reversalReason — same shape as
--     goods_receipts/purchase_returns' own reversal columns.
-- No backfill needed beyond the column default; no destructive changes.

-- AlterEnum
ALTER TYPE "SupplierPaymentPostingStatus" ADD VALUE 'REVERSED';

-- CreateEnum
CREATE TYPE "SupplierPaymentStatus" AS ENUM ('ACTIVE', 'REVERSED');

-- AlterTable
ALTER TABLE "supplier_payments" ADD COLUMN     "status" "SupplierPaymentStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "reversalJournalEntryId" UUID,
ADD COLUMN     "reversedAt" TIMESTAMP(3),
ADD COLUMN     "reversalReason" TEXT;
