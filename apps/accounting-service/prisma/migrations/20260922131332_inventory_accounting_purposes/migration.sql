-- Inventory Valuation + Inventory Accounting V1 (Phase 1) — extends
-- AccountMappingPurpose with the five semantic roles agreed in the design
-- review: INVENTORY_ASSET, COGS, GOODS_RECEIVED_NOT_INVOICED,
-- PURCHASE_PRICE_VARIANCE, OPENING_BALANCE_EQUITY. This phase adds the
-- enum values only — no resolution logic, posting logic, GRNI matching, PPV
-- calculation, Purchase/Sales Return logic, or seed data accompanies them
-- yet. They resolve through the existing AccountMapping mechanism exactly
-- like every purpose above. Purely additive — no existing enum value,
-- column, or table is touched.

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AccountMappingPurpose" ADD VALUE 'INVENTORY_ASSET';
ALTER TYPE "AccountMappingPurpose" ADD VALUE 'COGS';
ALTER TYPE "AccountMappingPurpose" ADD VALUE 'GOODS_RECEIVED_NOT_INVOICED';
ALTER TYPE "AccountMappingPurpose" ADD VALUE 'PURCHASE_PRICE_VARIANCE';
ALTER TYPE "AccountMappingPurpose" ADD VALUE 'OPENING_BALANCE_EQUITY';
