-- Phase C1 (Accounting Foundation) — generic account-mapping table and
-- journal-entry source reference for machine-posted entries.
--
-- Purely additive: new AccountMappingPurpose enum, new account_mappings
-- table, and four new nullable columns on journal_entries (all NULL for
-- every existing row and for every future manually-created entry — Postgres
-- treats each NULL tuple as distinct under a unique index, so the new
-- (tenantId, sourceService, sourceType, sourceId) unique constraint never
-- rejects existing data or coexisting manual entries). No existing column
-- is dropped, renamed, narrowed, or backfilled.

-- CreateEnum
CREATE TYPE "AccountMappingPurpose" AS ENUM ('PURCHASE_EXPENSE', 'ACCOUNTS_PAYABLE', 'INPUT_TAX', 'PAYMENT_METHOD');

-- AlterTable
ALTER TABLE "journal_entries" ADD COLUMN     "reversesJournalEntryId" UUID,
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceService" TEXT,
ADD COLUMN     "sourceType" TEXT;

-- CreateTable
CREATE TABLE "account_mappings" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "purpose" "AccountMappingPurpose" NOT NULL,
    "externalRefId" TEXT NOT NULL DEFAULT '',
    "accountId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "account_mappings_tenantId_idx" ON "account_mappings"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "account_mappings_tenantId_purpose_externalRefId_key" ON "account_mappings"("tenantId", "purpose", "externalRefId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_tenantId_sourceService_sourceType_sourceId_key" ON "journal_entries"("tenantId", "sourceService", "sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "account_mappings" ADD CONSTRAINT "account_mappings_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversesJournalEntryId_fkey" FOREIGN KEY ("reversesJournalEntryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
