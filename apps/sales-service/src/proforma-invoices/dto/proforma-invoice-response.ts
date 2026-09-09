import { Prisma, ProformaInvoiceStatus, ProformaSourceType } from '../../../generated/prisma-client';
import { moneyToString, quantityToString } from '../../common/decimal';

type ProformaItemTaxComponentRow = {
  id: string;
  sequence: number;
  type: string;
  name: string | null;
  rate: Prisma.Decimal;
  componentTaxAmount: Prisma.Decimal;
};

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
  discountTotal: Prisma.Decimal;
  taxTotal: Prisma.Decimal;
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
    createdAt: Date;
    updatedAt: Date;
    taxComponents: ProformaItemTaxComponentRow[];
  }>;
};

function toTaxComponentResponse(component: ProformaItemTaxComponentRow) {
  return {
    id: component.id,
    sequence: component.sequence,
    type: component.type,
    name: component.name,
    rate: component.rate.toFixed(4),
    componentTaxAmount: moneyToString(component.componentTaxAmount),
  };
}

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
    discountTotal: moneyToString(row.discountTotal),
    taxTotal: moneyToString(row.taxTotal),
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
      unitOfMeasureId: item.unitOfMeasureId,
      uomCode: item.uomCode,
      uomName: item.uomName,
      conversionFactor: item.conversionFactor
        ? quantityToString(item.conversionFactor)
        : null,
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
    })),
  };
}
