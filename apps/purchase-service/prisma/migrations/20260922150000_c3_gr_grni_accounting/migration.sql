-- Phase 3.1 (GRNI Accounting) — Goods Receipt -> Not-Invoiced accrual.
-- Purely additive: unitCost is nullable (never fabricated for pre-existing
-- rows, mirrors baseQuantity/conversionFactor's existing D12-style rule);
-- accountingPostingStatus/journalEntryId follow the exact same NOT NULL
-- with default / nullable soft-reference pattern already used for
-- PurchaseInvoice/SupplierPayment in 20260918125814_c2_accounting_posting_status.
-- No reversalJournalEntryId: Goods Receipt reversal is explicitly deferred
-- in this phase.

-- CreateEnum
CREATE TYPE "GoodsReceiptPostingStatus" AS ENUM ('NOT_POSTED', 'POSTED', 'FAILED');

-- AlterTable
ALTER TABLE "goods_receipt_items" ADD COLUMN     "unitCost" DECIMAL(19,4);

-- AlterTable
ALTER TABLE "goods_receipts" ADD COLUMN     "accountingPostingStatus" "GoodsReceiptPostingStatus" NOT NULL DEFAULT 'NOT_POSTED',
ADD COLUMN     "journalEntryId" UUID;
