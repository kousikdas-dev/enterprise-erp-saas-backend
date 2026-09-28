-- CreateEnum
CREATE TYPE "DebitNoteStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "DebitNotePostingStatus" AS ENUM ('NOT_POSTED', 'POSTED', 'FAILED', 'REVERSED');

-- CreateTable
CREATE TABLE "purchase_debit_notes" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "debitNoteNumber" TEXT NOT NULL,
    "supplierId" UUID NOT NULL,
    "supplierName" TEXT NOT NULL,
    "supplierGstin" TEXT,
    "supplierBillingAddress" TEXT,
    "purchaseInvoiceId" UUID,
    "debitNoteDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "notes" TEXT,
    "subtotal" DECIMAL(19,4) NOT NULL,
    "discountTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(19,4) NOT NULL,
    "status" "DebitNoteStatus" NOT NULL DEFAULT 'DRAFT',
    "postedAt" TIMESTAMP(3),
    "postedBy" UUID,
    "reversedAt" TIMESTAMP(3),
    "reversedBy" UUID,
    "reversalReason" TEXT,
    "accountingPostingStatus" "DebitNotePostingStatus" NOT NULL DEFAULT 'NOT_POSTED',
    "journalEntryId" UUID,
    "reversalJournalEntryId" UUID,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_debit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_debit_note_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "purchaseDebitNoteId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(19,6) NOT NULL,
    "unitCost" DECIMAL(19,4) NOT NULL,
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

    CONSTRAINT "purchase_debit_note_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_debit_note_item_tax_components" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "purchaseDebitNoteItemId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT,
    "rate" DECIMAL(7,4) NOT NULL,
    "componentTaxAmount" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_debit_note_item_tax_components_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_debit_notes_tenantId_idx" ON "purchase_debit_notes"("tenantId");

-- CreateIndex
CREATE INDEX "purchase_debit_notes_tenantId_supplierId_idx" ON "purchase_debit_notes"("tenantId", "supplierId");

-- CreateIndex
CREATE INDEX "purchase_debit_notes_tenantId_status_idx" ON "purchase_debit_notes"("tenantId", "status");

-- CreateIndex
CREATE INDEX "purchase_debit_notes_tenantId_purchaseInvoiceId_idx" ON "purchase_debit_notes"("tenantId", "purchaseInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_debit_notes_tenantId_debitNoteNumber_key" ON "purchase_debit_notes"("tenantId", "debitNoteNumber");

-- CreateIndex
CREATE INDEX "purchase_debit_note_items_tenantId_idx" ON "purchase_debit_note_items"("tenantId");

-- CreateIndex
CREATE INDEX "purchase_debit_note_items_purchaseDebitNoteId_idx" ON "purchase_debit_note_items"("purchaseDebitNoteId");

-- CreateIndex
CREATE INDEX "purchase_debit_note_item_tax_components_tenantId_idx" ON "purchase_debit_note_item_tax_components"("tenantId");

-- CreateIndex
CREATE INDEX "purchase_debit_note_item_tax_components_purchaseDebitNoteIt_idx" ON "purchase_debit_note_item_tax_components"("purchaseDebitNoteItemId");

-- AddForeignKey
ALTER TABLE "purchase_debit_notes" ADD CONSTRAINT "purchase_debit_notes_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_debit_notes" ADD CONSTRAINT "purchase_debit_notes_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "purchase_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_debit_note_items" ADD CONSTRAINT "purchase_debit_note_items_purchaseDebitNoteId_fkey" FOREIGN KEY ("purchaseDebitNoteId") REFERENCES "purchase_debit_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_debit_note_item_tax_components" ADD CONSTRAINT "purchase_debit_note_item_tax_components_purchaseDebitNoteI_fkey" FOREIGN KEY ("purchaseDebitNoteItemId") REFERENCES "purchase_debit_note_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
