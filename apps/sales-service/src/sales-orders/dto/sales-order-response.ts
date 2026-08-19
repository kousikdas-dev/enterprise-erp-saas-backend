import { Prisma, SalesOrderStatus } from '../../../generated/prisma-client';
import { moneyToString, quantityToString } from '../../common/decimal';

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
    unitPrice: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
    shippedQuantity: Prisma.Decimal;
    createdAt: Date;
    updatedAt: Date;
  }>;
};

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
        shippedQuantity: quantityToString(item.shippedQuantity),
        remainingQuantity: quantityToString(remaining),
        unitPrice: moneyToString(item.unitPrice),
        lineTotal: moneyToString(item.lineTotal),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    }),
  };
}
