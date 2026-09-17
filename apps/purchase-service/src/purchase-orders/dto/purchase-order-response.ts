import { Prisma, PurchaseOrderStatus } from '../../../generated/prisma-client';
import { moneyToString, quantityToString } from '../../common/decimal';

type PurchaseOrderItemTaxComponentRow = {
  id: string;
  sequence: number;
  type: string;
  name: string | null;
  rate: Prisma.Decimal;
  componentTaxAmount: Prisma.Decimal;
};

type OrderWithItems = {
  id: string;
  tenantId: string;
  poNumber: string;
  supplierId: string;
  status: PurchaseOrderStatus;
  supplierName: string;
  supplierGstin: string | null;
  supplierBillingAddress: string | null;
  supplierDispatchAddress: string | null;
  paymentTermId: string | null;
  buyerId: string | null;
  warehouseId: string | null;
  supplierReference: string | null;
  expectedDeliveryDate: Date | null;
  notes: string | null;
  orderDate: Date;
  subtotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  taxTotal: Prisma.Decimal;
  total: Prisma.Decimal;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    tenantId: string;
    purchaseOrderId: string;
    productId: string;
    productSku: string;
    productName: string;
    quantity: Prisma.Decimal;
    unitOfMeasureId: string | null;
    uomCode: string | null;
    uomName: string | null;
    conversionFactor: Prisma.Decimal | null;
    unitCost: Prisma.Decimal;
    discountPercent: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    taxCodeId: string | null;
    taxCode: string | null;
    taxCodeName: string | null;
    taxAmount: Prisma.Decimal;
    lineSubtotal: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
    receivedQuantity: Prisma.Decimal;
    invoicedQuantity: Prisma.Decimal;
    createdAt: Date;
    updatedAt: Date;
    taxComponents: PurchaseOrderItemTaxComponentRow[];
  }>;
};

function toTaxComponentResponse(component: PurchaseOrderItemTaxComponentRow) {
  return {
    id: component.id,
    sequence: component.sequence,
    type: component.type,
    name: component.name,
    rate: component.rate.toFixed(4),
    componentTaxAmount: moneyToString(component.componentTaxAmount),
  };
}

export function toPurchaseOrderResponse(row: OrderWithItems) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    poNumber: row.poNumber,
    supplierId: row.supplierId,
    status: row.status,
    supplierName: row.supplierName,
    supplierGstin: row.supplierGstin,
    supplierBillingAddress: row.supplierBillingAddress,
    supplierDispatchAddress: row.supplierDispatchAddress,
    paymentTermId: row.paymentTermId,
    buyerId: row.buyerId,
    warehouseId: row.warehouseId,
    supplierReference: row.supplierReference,
    expectedDeliveryDate: row.expectedDeliveryDate,
    notes: row.notes,
    orderDate: row.orderDate,
    subtotal: moneyToString(row.subtotal),
    discountTotal: moneyToString(row.discountTotal),
    taxTotal: moneyToString(row.taxTotal),
    total: moneyToString(row.total),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: row.items.map((item) => ({
      id: item.id,
      tenantId: item.tenantId,
      purchaseOrderId: item.purchaseOrderId,
      productId: item.productId,
      productSku: item.productSku,
      productName: item.productName,
      quantity: quantityToString(item.quantity),
      unitOfMeasureId: item.unitOfMeasureId,
      uomCode: item.uomCode,
      uomName: item.uomName,
      conversionFactor: item.conversionFactor
        ? quantityToString(item.conversionFactor)
        : null,
      unitCost: moneyToString(item.unitCost),
      discountPercent: item.discountPercent.toFixed(2),
      discountAmount: moneyToString(item.discountAmount),
      taxCodeId: item.taxCodeId,
      taxCode: item.taxCode,
      taxCodeName: item.taxCodeName,
      taxAmount: moneyToString(item.taxAmount),
      lineSubtotal: moneyToString(item.lineSubtotal),
      lineTotal: moneyToString(item.lineTotal),
      receivedQuantity: quantityToString(item.receivedQuantity),
      // Purchase Invoice V1 (Section 22) accumulator — commercial-UOM
      // quantity billed so far across CONFIRMED PurchaseInvoices for this
      // line. Read-only here; only purchase-invoices.service.ts writes it.
      invoicedQuantity: quantityToString(item.invoicedQuantity),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      taxComponents: item.taxComponents.map(toTaxComponentResponse),
    })),
  };
}
