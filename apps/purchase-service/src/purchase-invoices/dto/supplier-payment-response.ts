import { Prisma } from '../../../generated/prisma-client';
import { moneyToString } from '../../common/decimal';

type SupplierPaymentRow = {
  id: string;
  tenantId: string;
  purchaseInvoiceId: string;
  amount: Prisma.Decimal;
  paymentDate: Date;
  paymentMethodId: string | null;
  reference: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toSupplierPaymentResponse(row: SupplierPaymentRow) {
  return {
    id: row.id,
    purchaseInvoiceId: row.purchaseInvoiceId,
    amount: moneyToString(row.amount),
    paymentDate: row.paymentDate,
    paymentMethodId: row.paymentMethodId,
    reference: row.reference,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
