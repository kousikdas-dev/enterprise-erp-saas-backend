-- Sales Accounting Integration — Sales-side cache columns of accounting-
-- service's own posting state, mirroring Purchase's Phase C2
-- (PurchaseInvoicePostingStatus/SupplierPaymentPostingStatus) exactly.
-- Purely additive, NOT NULL with a default so every existing row backfills
-- safely to NOT_POSTED. No FK to accounting_db (separate database; soft
-- reference, mirrors paymentTermId/paymentMethodId). The authoritative
-- idempotency/dedup guard lives in accounting-service's own unique
-- constraint, not in these columns.

-- CreateEnum
CREATE TYPE "SalesInvoicePostingStatus" AS ENUM ('NOT_POSTED', 'POSTED', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "SalesPaymentPostingStatus" AS ENUM ('NOT_POSTED', 'POSTED', 'FAILED');

-- AlterTable
ALTER TABLE "sales_invoices" ADD COLUMN     "accountingPostingStatus" "SalesInvoicePostingStatus" NOT NULL DEFAULT 'NOT_POSTED',
ADD COLUMN     "journalEntryId" UUID,
ADD COLUMN     "reversalJournalEntryId" UUID;

-- AlterTable
ALTER TABLE "sales_payments" ADD COLUMN     "accountingPostingStatus" "SalesPaymentPostingStatus" NOT NULL DEFAULT 'NOT_POSTED',
ADD COLUMN     "journalEntryId" UUID;
