import { Prisma, ShipmentStatus } from '../../../generated/prisma-client';
import { quantityToString } from '../../common/decimal';

type ShipmentWithItems = {
  id: string;
  tenantId: string;
  salesOrderId: string;
  warehouseId: string;
  status: ShipmentStatus;
  shippedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
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
      warehouseId: row.warehouseId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
  };
}
