import { Prisma } from '../../../generated/prisma-client';
import { moneyToString } from '../../common/decimal';

type SalesPaymentRow = {
  id: string;
  tenantId: string;
  salesInvoiceId: string;
  amount: Prisma.Decimal;
  paymentDate: Date;
  paymentMethodId: string | null;
  reference: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toSalesPaymentResponse(row: SalesPaymentRow) {
  return {
    id: row.id,
    salesInvoiceId: row.salesInvoiceId,
    amount: moneyToString(row.amount),
    paymentDate: row.paymentDate,
    paymentMethodId: row.paymentMethodId,
    reference: row.reference,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
