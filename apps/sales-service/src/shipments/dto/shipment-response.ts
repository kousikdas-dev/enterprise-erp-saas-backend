import {
  Prisma,
  ShipmentPostingStatus,
  ShipmentStatus,
} from '../../../generated/prisma-client';
import { moneyToString, quantityToString } from '../../common/decimal';

type ShipmentWithItems = {
  id: string;
  tenantId: string;
  salesOrderId: string;
  warehouseId: string;
  status: ShipmentStatus;
  shippedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // Phase 3.3 (Sales Shipment COGS)
  accountingPostingStatus: ShipmentPostingStatus;
  journalEntryId: string | null;
  items: Array<{
    id: string;
    tenantId: string;
    shipmentId: string;
    salesOrderItemId: string;
    productId: string;
    productSku: string;
    productName: string;
    quantity: Prisma.Decimal;
    unitOfMeasureId: string | null;
    uomCode: string | null;
    uomName: string | null;
    conversionFactor: Prisma.Decimal | null;
    baseQuantity: Prisma.Decimal | null;
    conversionResolvedBy: string | null;
    conversionResolvedAt: Date | null;
    conversionResolutionNote: string | null;
    // Phase 3.3 (Sales Shipment COGS)
    productTracksInventory: boolean | null;
    unitCost: Prisma.Decimal | null;
    totalCost: Prisma.Decimal | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
};

export function toShipmentResponse(row: ShipmentWithItems) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    salesOrderId: row.salesOrderId,
    warehouseId: row.warehouseId,
    status: row.status,
    shippedAt: row.shippedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    accountingPostingStatus: row.accountingPostingStatus,
    journalEntryId: row.journalEntryId,
    items: row.items.map((item) => ({
      id: item.id,
      tenantId: item.tenantId,
      shipmentId: item.shipmentId,
      salesOrderItemId: item.salesOrderItemId,
      productId: item.productId,
      productSku: item.productSku,
      productName: item.productName,
      quantity: quantityToString(item.quantity),
      unitOfMeasureId: item.unitOfMeasureId,
      uomCode: item.uomCode,
      uomName: item.uomName,
      conversionFactor: item.conversionFactor
        ? item.conversionFactor.toString()
        : null,
      baseQuantity: item.baseQuantity
        ? quantityToString(item.baseQuantity)
        : null,
      // true only while the shipment is blocked AND this specific line is
      // the reason — lets the UI target exactly the lines needing manual
      // resolution rather than every line on a blocked shipment.
      needsConversionResolution:
        row.status === ShipmentStatus.UOM_RESOLUTION_REQUIRED &&
        item.baseQuantity === null,
      conversionResolvedBy: item.conversionResolvedBy,
      conversionResolvedAt: item.conversionResolvedAt,
      conversionResolutionNote: item.conversionResolutionNote,
      productTracksInventory: item.productTracksInventory,
      unitCost: item.unitCost ? moneyToString(item.unitCost) : null,
      totalCost: item.totalCost ? moneyToString(item.totalCost) : null,
      warehouseId: row.warehouseId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
  };
}
