-- CreateEnum
CREATE TYPE "SalesInvoicePaymentStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID');

-- AlterTable
ALTER TABLE "sales_invoices" ADD COLUMN     "amountPaid" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "paymentStatus" "SalesInvoicePaymentStatus" NOT NULL DEFAULT 'UNPAID';

-- CreateTable
CREATE TABLE "sales_payments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "salesInvoiceId" UUID NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "paymentMethodId" UUID,
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_payments_tenantId_idx" ON "sales_payments"("tenantId");

-- CreateIndex
CREATE INDEX "sales_payments_salesInvoiceId_idx" ON "sales_payments"("salesInvoiceId");

-- AddForeignKey
ALTER TABLE "sales_payments" ADD CONSTRAINT "sales_payments_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "sales_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
