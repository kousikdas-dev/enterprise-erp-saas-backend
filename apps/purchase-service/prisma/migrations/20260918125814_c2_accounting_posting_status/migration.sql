-- Phase C2 (Purchase Accounting Integration) — Purchase-side cache columns
-- of accounting-service's own posting state. Purely additive, NOT NULL with
-- a default so every existing row backfills safely to NOT_POSTED. No FK to
-- accounting_db (separate database; soft reference, mirrors paymentTermId).
-- The authoritative idempotency/dedup guard lives in accounting-service's
-- own unique constraint, not in these columns (see the schema.prisma
-- model-group comment above PurchaseInvoice for the full rationale).

-- CreateEnum
CREATE TYPE "PurchaseInvoicePostingStatus" AS ENUM ('NOT_POSTED', 'POSTED', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "SupplierPaymentPostingStatus" AS ENUM ('NOT_POSTED', 'POSTED', 'FAILED');

-- AlterTable
ALTER TABLE "purchase_invoices" ADD COLUMN     "accountingPostingStatus" "PurchaseInvoicePostingStatus" NOT NULL DEFAULT 'NOT_POSTED',
ADD COLUMN     "journalEntryId" UUID,
ADD COLUMN     "reversalJournalEntryId" UUID;

-- AlterTable
ALTER TABLE "supplier_payments" ADD COLUMN     "accountingPostingStatus" "SupplierPaymentPostingStatus" NOT NULL DEFAULT 'NOT_POSTED',
ADD COLUMN     "journalEntryId" UUID;
