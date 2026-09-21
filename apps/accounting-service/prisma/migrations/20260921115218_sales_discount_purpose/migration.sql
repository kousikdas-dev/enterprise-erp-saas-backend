-- Sales Accounting Integration (follow-up) — extends AccountMappingPurpose
-- with SALES_DISCOUNT, a contra-revenue purpose tracked as its own journal
-- line (debited) instead of being netted directly into SALES_REVENUE.
-- Purely additive — no existing enum value, column, or table is touched.
-- The mapped Account is expected to be AccountType.REVENUE (no separate
-- CONTRA_REVENUE AccountType is introduced); debit-normal usage is a
-- posting-time convention only.

-- AlterEnum
ALTER TYPE "AccountMappingPurpose" ADD VALUE 'SALES_DISCOUNT';
