-- Sales Shipment UOM Phase A (Inventory Design v4) — brings Sales Shipment's
-- Inventory posting in line with Purchase Goods Receipt: ShipmentItem gains a
-- UOM snapshot + baseQuantity (the only value ever sent to Inventory), plus
-- an UOM_RESOLUTION_REQUIRED status and resolution-audit columns for legacy
-- pre-fix rows whose historical conversion cannot be safely recovered.
-- Purely additive — no existing enum value, column, or table is touched.

-- AlterEnum
ALTER TYPE "ShipmentStatus" ADD VALUE 'UOM_RESOLUTION_REQUIRED';

-- AlterTable
ALTER TABLE "shipment_items" ADD COLUMN     "baseQuantity" DECIMAL(19,6),
ADD COLUMN     "conversionFactor" DECIMAL(19,6),
ADD COLUMN     "conversionResolutionNote" TEXT,
ADD COLUMN     "conversionResolvedAt" TIMESTAMP(3),
ADD COLUMN     "conversionResolvedBy" TEXT,
ADD COLUMN     "unitOfMeasureId" UUID,
ADD COLUMN     "uomCode" TEXT,
ADD COLUMN     "uomName" TEXT;
