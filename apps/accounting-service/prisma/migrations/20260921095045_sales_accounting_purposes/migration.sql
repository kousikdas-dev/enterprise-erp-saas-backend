-- Sales Accounting Integration — extends AccountMappingPurpose with the
-- three Sales-side semantic roles (SALES_REVENUE, ACCOUNTS_RECEIVABLE,
-- OUTPUT_TAX), mirroring PURCHASE_EXPENSE/ACCOUNTS_PAYABLE/INPUT_TAX.
-- PAYMENT_METHOD is reused unchanged (already generic/shared). Purely
-- additive — no existing enum value, column, or table is touched.

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AccountMappingPurpose" ADD VALUE 'SALES_REVENUE';
ALTER TYPE "AccountMappingPurpose" ADD VALUE 'ACCOUNTS_RECEIVABLE';
ALTER TYPE "AccountMappingPurpose" ADD VALUE 'OUTPUT_TAX';
