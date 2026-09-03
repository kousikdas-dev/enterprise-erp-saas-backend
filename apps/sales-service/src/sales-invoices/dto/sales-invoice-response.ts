import {
  Prisma,
  SalesInvoiceSourceType,
  SalesInvoiceStatus,
} from '../../../generated/prisma-client';
import { moneyToString, quantityToString } from '../../common/decimal';

type SalesInvoiceWithItems = {
  id: string;
  tenantId: string;
  invoiceNumber: string;
  sourceType: SalesInvoiceSourceType | null;
  sourceId: string | null;
  status: SalesInvoiceStatus;
  customerId: string;
  customerName: string;
  billingAddress: string | null;
  shippingAddress: string | null;
  paymentTermId: string | null;
  salespersonId: string | null;
  invoiceDate: Date;
  dueDate: Date | null;
  notes: string | null;
  subtotal: Prisma.Decimal;
  total: Prisma.Decimal;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    tenantId: string;
    salesInvoiceId: string;
    productId: string;
    productSku: string;
    productName: string;
    quantity: Prisma.Decimal;
    unitPrice: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
    createdAt: Date;
    updatedAt: Date;
  }>;
};

export function toSalesInvoiceResponse(row: SalesInvoiceWithItems) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    invoiceNumber: row.invoiceNumber,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    status: row.status,
    customerId: row.customerId,
    customerName: row.customerName,
    billingAddress: row.billingAddress,
    shippingAddress: row.shippingAddress,
    paymentTermId: row.paymentTermId,
    salespersonId: row.salespersonId,
    invoiceDate: row.invoiceDate,
    dueDate: row.dueDate,
    notes: row.notes,
    subtotal: moneyToString(row.subtotal),
    total: moneyToString(row.total),
    sentAt: row.sentAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: row.items.map((item) => ({
      id: item.id,
      tenantId: item.tenantId,
      salesInvoiceId: item.salesInvoiceId,
      productId: item.productId,
      productSku: item.productSku,
      productName: item.productName,
      quantity: quantityToString(item.quantity),
      unitPrice: moneyToString(item.unitPrice),
      lineTotal: moneyToString(item.lineTotal),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
  };
}
