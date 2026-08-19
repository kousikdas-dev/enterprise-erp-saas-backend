import { Prisma, QuotationStatus } from '../../../generated/prisma-client';
import { moneyToString, quantityToString } from '../../common/decimal';

type QuotationWithItems = {
  id: string;
  tenantId: string;
  customerId: string;
  status: QuotationStatus;
  customerName: string;
  billingAddress: string | null;
  shippingAddress: string | null;
  notes: string | null;
  subtotal: Prisma.Decimal;
  total: Prisma.Decimal;
  validUntil: Date | null;
  sentAt: Date | null;
  acceptedAt: Date | null;
  rejectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    tenantId: string;
    quotationId: string;
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

export function toQuotationResponse(row: QuotationWithItems) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    customerId: row.customerId,
    status: row.status,
    customerName: row.customerName,
    billingAddress: row.billingAddress,
    shippingAddress: row.shippingAddress,
    notes: row.notes,
    subtotal: moneyToString(row.subtotal),
    total: moneyToString(row.total),
    validUntil: row.validUntil,
    sentAt: row.sentAt,
    acceptedAt: row.acceptedAt,
    rejectedAt: row.rejectedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: row.items.map((item) => ({
      id: item.id,
      tenantId: item.tenantId,
      quotationId: item.quotationId,
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
