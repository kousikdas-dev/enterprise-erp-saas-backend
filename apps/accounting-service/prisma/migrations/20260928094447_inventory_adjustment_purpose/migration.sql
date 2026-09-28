-- Phase 3.15 (Inventory Adjustment Accounting) — adds the INVENTORY_ADJUSTMENT
-- purpose to AccountMappingPurpose: the contra account for a Stock
-- Adjustment (ADJUSTMENT_IN/ADJUSTMENT_OUT) journal's non-Inventory-Asset
-- side. Resolves through the existing AccountMapping mechanism exactly like
-- every purpose already in this enum — no resolution logic, posting logic,
-- or seed data accompanies it here. Purely additive — no existing enum
-- value, column, or table is touched.

-- AlterEnum
ALTER TYPE "AccountMappingPurpose" ADD VALUE 'INVENTORY_ADJUSTMENT';
