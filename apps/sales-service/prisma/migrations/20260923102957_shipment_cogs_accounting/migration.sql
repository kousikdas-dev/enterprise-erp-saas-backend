-- CreateEnum
CREATE TYPE "ShipmentPostingStatus" AS ENUM ('NOT_POSTED', 'POSTED', 'FAILED');

-- AlterTable
ALTER TABLE "proforma_invoice_items" ADD COLUMN     "productTracksInventory" BOOLEAN;

-- AlterTable
ALTER TABLE "quotation_items" ADD COLUMN     "productTracksInventory" BOOLEAN;

-- AlterTable
ALTER TABLE "sales_order_items" ADD COLUMN     "productTracksInventory" BOOLEAN;

-- AlterTable
ALTER TABLE "shipment_items" ADD COLUMN     "productTracksInventory" BOOLEAN,
ADD COLUMN     "totalCost" DECIMAL(19,4),
ADD COLUMN     "unitCost" DECIMAL(19,4);

-- AlterTable
ALTER TABLE "shipments" ADD COLUMN     "accountingPostingStatus" "ShipmentPostingStatus" NOT NULL DEFAULT 'NOT_POSTED',
ADD COLUMN     "journalEntryId" UUID;
