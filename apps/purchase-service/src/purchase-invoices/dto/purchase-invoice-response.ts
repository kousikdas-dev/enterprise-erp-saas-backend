import {
  Prisma,
  PurchaseInvoicePaymentStatus,
  PurchaseInvoiceStatus,
} from '../../../generated/prisma-client';
import { moneyToString, quantityToString } from '../../common/decimal';

type ItemTaxComponentRow = {
  id: string;
  sequence: number;
  type: string;
  name: string | null;
  rate: Prisma.Decimal;
  componentTaxAmount: Prisma.Decimal;
};

type InvoiceWithItems = {
  id: string;
  tenantId: string;
  invoiceNumber: string;
  supplierInvoiceNumber: string | null;
  purchaseOrderId: string;
  status: PurchaseInvoiceStatus;
  supplierId: string;
  supplierName: string;
  supplierGstin: string | null;
  supplierBillingAddress: string | null;
  paymentTermId: string | null;
  invoiceDate: Date;
  dueDate: Date | null;
  notes: string | null;
  subtotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  taxTotal: Prisma.Decimal;
  total: Prisma.Decimal;
  amountPaid: Prisma.Decimal;
  paymentStatus: PurchaseInvoicePaymentStatus;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    tenantId: string;
    purchaseInvoiceId: string;
    purchaseOrderItemId: string;
    goodsReceiptItemId: string | null;
    productId: string;
    productSku: string;
    productName: string;
    unitOfMeasureId: string | null;
    uomCode: string | null;
    uomName: string | null;
    conversionFactor: Prisma.Decimal | null;
    quantity: Prisma.Decimal;
    unitCost: Prisma.Decimal;
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
    taxComponents: ItemTaxComponentRow[];
  }>;
};

function toTaxComponentResponse(component: ItemTaxComponentRow) {
  return {
    id: component.id,
    sequence: component.sequence,
    type: component.type,
    name: component.name,
    rate: component.rate.toFixed(4),
    componentTaxAmount: moneyToString(component.componentTaxAmount),
  };
}

/** Minimal PurchaseOrderItem shape needed to compute mismatch flags. */
export type MismatchSourcePoItem = {
  unitCost: Prisma.Decimal;
  discountPercent: Prisma.Decimal;
  taxCodeId: string | null;
};

export function toPurchaseInvoiceResponse(
  row: InvoiceWithItems,
  poItemsById?: Map<string, MismatchSourcePoItem>,
) {
  const balanceDue = row.total.minus(row.amountPaid);
  return {
    id: row.id,
    tenantId: row.tenantId,
    invoiceNumber: row.invoiceNumber,
    supplierInvoiceNumber: row.supplierInvoiceNumber,
    purchaseOrderId: row.purchaseOrderId,
    status: row.status,
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    supplierGstin: row.supplierGstin,
    supplierBillingAddress: row.supplierBillingAddress,
    paymentTermId: row.paymentTermId,
    invoiceDate: row.invoiceDate,
    dueDate: row.dueDate,
    notes: row.notes,
    subtotal: moneyToString(row.subtotal),
    discountTotal: moneyToString(row.discountTotal),
    taxTotal: moneyToString(row.taxTotal),
    total: moneyToString(row.total),
    amountPaid: moneyToString(row.amountPaid),
    // balanceDue is intentionally never persisted — always total - amountPaid
    // (mirrors SalesInvoice's response convention exactly).
    balanceDue: moneyToString(balanceDue),
    paymentStatus: row.paymentStatus,
    confirmedAt: row.confirmedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: row.items.map((item) => {
      // Three-way matching (Section 22.5): computed on read by comparing
      // this line's own billed values against the referenced PurchaseOrderItem
      // — flag-only, zero built-in tolerance, never blocks. Quantity is
      // bounded separately (hard) at confirm() time; this is cost/tax/
      // discount only. poItemsById is optional so callers that don't need
      // matching info (e.g. internal use) can omit the extra lookup.
      const poItem = poItemsById?.get(item.purchaseOrderItemId);
      const costMismatch = poItem ? !item.unitCost.eq(poItem.unitCost) : false;
      const discountMismatch = poItem
        ? !item.discountPercent.eq(poItem.discountPercent)
        : false;
      const taxMismatch = poItem
        ? (item.taxCodeId ?? null) !== (poItem.taxCodeId ?? null)
        : false;

      return {
        id: item.id,
        tenantId: item.tenantId,
        purchaseInvoiceId: item.purchaseInvoiceId,
        purchaseOrderItemId: item.purchaseOrderItemId,
        goodsReceiptItemId: item.goodsReceiptItemId,
        productId: item.productId,
        productSku: item.productSku,
        productName: item.productName,
        unitOfMeasureId: item.unitOfMeasureId,
        uomCode: item.uomCode,
        uomName: item.uomName,
        conversionFactor: item.conversionFactor
          ? quantityToString(item.conversionFactor)
          : null,
        quantity: quantityToString(item.quantity),
        unitCost: moneyToString(item.unitCost),
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
        costMismatch,
        discountMismatch,
        taxMismatch,
      };
    }),
  };
}

export { PurchaseInvoiceStatus, PurchaseInvoicePaymentStatus };
