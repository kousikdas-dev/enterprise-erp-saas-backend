import { Prisma, SalesOrderStatus } from '../../../generated/prisma-client';
import { moneyToString, quantityToString } from '../../common/decimal';

type SalesOrderItemTaxComponentRow = {
  id: string;
  sequence: number;
  type: string;
  name: string | null;
  rate: Prisma.Decimal;
  componentTaxAmount: Prisma.Decimal;
};

type SalesOrderWithItems = {
  id: string;
  tenantId: string;
  customerId: string;
  quotationId: string | null;
  status: SalesOrderStatus;
  customerName: string;
  billingAddress: string | null;
  shippingAddress: string | null;
  notes: string | null;
  subtotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  taxTotal: Prisma.Decimal;
  total: Prisma.Decimal;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    tenantId: string;
    salesOrderId: string;
    productId: string;
    productSku: string;
    productName: string;
    quantity: Prisma.Decimal;
    unitOfMeasureId: string | null;
    uomCode: string | null;
    uomName: string | null;
    conversionFactor: Prisma.Decimal | null;
    unitPrice: Prisma.Decimal;
    discountPercent: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    taxCodeId: string | null;
    taxCode: string | null;
    taxCodeName: string | null;
    taxAmount: Prisma.Decimal;
    lineSubtotal: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
    shippedQuantity: Prisma.Decimal;
    createdAt: Date;
    updatedAt: Date;
    taxComponents: SalesOrderItemTaxComponentRow[];
  }>;
};

function toTaxComponentResponse(component: SalesOrderItemTaxComponentRow) {
  return {
    id: component.id,
    sequence: component.sequence,
    type: component.type,
    name: component.name,
    rate: component.rate.toFixed(4),
    componentTaxAmount: moneyToString(component.componentTaxAmount),
  };
}

export function toSalesOrderResponse(row: SalesOrderWithItems) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    customerId: row.customerId,
    quotationId: row.quotationId,
    status: row.status,
    customerName: row.customerName,
    billingAddress: row.billingAddress,
    shippingAddress: row.shippingAddress,
    notes: row.notes,
    subtotal: moneyToString(row.subtotal),
    discountTotal: moneyToString(row.discountTotal),
    taxTotal: moneyToString(row.taxTotal),
    total: moneyToString(row.total),
    confirmedAt: row.confirmedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: row.items.map((item) => {
      const remaining = item.quantity.minus(item.shippedQuantity);
      return {
        id: item.id,
        tenantId: item.tenantId,
        salesOrderId: item.salesOrderId,
        productId: item.productId,
        productSku: item.productSku,
        productName: item.productName,
        orderedQuantity: quantityToString(item.quantity),
        unitOfMeasureId: item.unitOfMeasureId,
        uomCode: item.uomCode,
        uomName: item.uomName,
        conversionFactor: item.conversionFactor
          ? quantityToString(item.conversionFactor)
          : null,
        shippedQuantity: quantityToString(item.shippedQuantity),
        remainingQuantity: quantityToString(remaining),
        unitPrice: moneyToString(item.unitPrice),
        discountPercent: item.discountPercent.toFixed(2),
        discountAmount: moneyToString(item.discountAmount),
        taxCodeId: item.taxCodeId,
        taxCode: item.taxCode,
        taxCodeName: item.taxCodeName,
        taxAmount: moneyToString(item.taxAmount),
        lineSubtotal: moneyToString(item.lineSubtotal),
        lineTotal: moneyToString(item.lineTotal),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        taxComponents: item.taxComponents.map(toTaxComponentResponse),
      };
    }),
  };
}
