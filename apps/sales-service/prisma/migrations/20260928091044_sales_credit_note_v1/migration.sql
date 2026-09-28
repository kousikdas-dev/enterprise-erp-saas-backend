-- CreateEnum
CREATE TYPE "SalesCreditNoteStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "SalesCreditNotePostingStatus" AS ENUM ('NOT_POSTED', 'POSTED', 'FAILED', 'REVERSED');

-- CreateTable
CREATE TABLE "sales_credit_notes" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "creditNoteNumber" TEXT NOT NULL,
    "customerId" UUID NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerGstin" TEXT,
    "customerBillingAddress" TEXT,
    "salesInvoiceId" UUID,
    "creditNoteDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "notes" TEXT,
    "subtotal" DECIMAL(19,4) NOT NULL,
    "discountTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(19,4) NOT NULL,
    "status" "SalesCreditNoteStatus" NOT NULL DEFAULT 'DRAFT',
    "postedAt" TIMESTAMP(3),
    "postedBy" UUID,
    "reversedAt" TIMESTAMP(3),
    "reversedBy" UUID,
    "reversalReason" TEXT,
    "accountingPostingStatus" "SalesCreditNotePostingStatus" NOT NULL DEFAULT 'NOT_POSTED',
    "journalEntryId" UUID,
    "reversalJournalEntryId" UUID,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_credit_note_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "salesCreditNoteId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(19,6) NOT NULL,
    "unitPrice" DECIMAL(19,4) NOT NULL,
    "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "taxCodeId" UUID,
    "taxCode" TEXT,
    "taxCodeName" TEXT,
    "taxAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "lineSubtotal" DECIMAL(19,4) NOT NULL,
    "lineTotal" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_credit_note_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_credit_note_item_tax_components" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "salesCreditNoteItemId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT,
    "rate" DECIMAL(7,4) NOT NULL,
    "componentTaxAmount" DECIMAL(19,4) NOT NULL,

    CONSTRAINT "sales_credit_note_item_tax_components_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_credit_notes_tenantId_idx" ON "sales_credit_notes"("tenantId");

-- CreateIndex
CREATE INDEX "sales_credit_notes_tenantId_customerId_idx" ON "sales_credit_notes"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "sales_credit_notes_tenantId_status_idx" ON "sales_credit_notes"("tenantId", "status");

-- CreateIndex
CREATE INDEX "sales_credit_notes_tenantId_salesInvoiceId_idx" ON "sales_credit_notes"("tenantId", "salesInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_credit_notes_tenantId_creditNoteNumber_key" ON "sales_credit_notes"("tenantId", "creditNoteNumber");

-- CreateIndex
CREATE INDEX "sales_credit_note_items_tenantId_idx" ON "sales_credit_note_items"("tenantId");

-- CreateIndex
CREATE INDEX "sales_credit_note_items_salesCreditNoteId_idx" ON "sales_credit_note_items"("salesCreditNoteId");

-- CreateIndex
CREATE INDEX "sales_credit_note_item_tax_components_tenantId_idx" ON "sales_credit_note_item_tax_components"("tenantId");

-- CreateIndex
CREATE INDEX "sales_credit_note_item_tax_components_salesCreditNoteItemId_idx" ON "sales_credit_note_item_tax_components"("salesCreditNoteItemId");

-- AddForeignKey
ALTER TABLE "sales_credit_notes" ADD CONSTRAINT "sales_credit_notes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_credit_notes" ADD CONSTRAINT "sales_credit_notes_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "sales_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_credit_note_items" ADD CONSTRAINT "sales_credit_note_items_salesCreditNoteId_fkey" FOREIGN KEY ("salesCreditNoteId") REFERENCES "sales_credit_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_credit_note_item_tax_components" ADD CONSTRAINT "sales_credit_note_item_tax_components_salesCreditNoteItemI_fkey" FOREIGN KEY ("salesCreditNoteItemId") REFERENCES "sales_credit_note_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
