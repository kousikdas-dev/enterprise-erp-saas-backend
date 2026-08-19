import { Prisma, ProformaInvoiceStatus, ProformaSourceType } from '../../../generated/prisma-client';
import { moneyToString, quantityToString } from '../../common/decimal';

type ProformaWithItems = {
  id: string;
  tenantId: string;
  documentNumber: string;
  sourceType: ProformaSourceType;
  sourceId: string;
  status: ProformaInvoiceStatus;
  customerId: string;
  customerName: string;
  billingAddress: string | null;
  shippingAddress: string | null;
  notes: string | null;
  subtotal: Prisma.Decimal;
  total: Prisma.Decimal;
  issuedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    tenantId: string;
    proformaInvoiceId: string;
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

export function toProformaResponse(row: ProformaWithItems) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    documentNumber: row.documentNumber,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    status: row.status,
    customerId: row.customerId,
    customerName: row.customerName,
    billingAddress: row.billingAddress,
    shippingAddress: row.shippingAddress,
    notes: row.notes,
    subtotal: moneyToString(row.subtotal),
    total: moneyToString(row.total),
    issuedAt: row.issuedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: row.items.map((item) => ({
      id: item.id,
      tenantId: item.tenantId,
      proformaInvoiceId: item.proformaInvoiceId,
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
