-- CreateEnum
CREATE TYPE "JournalEntryStatus" AS ENUM ('DRAFT', 'POSTED', 'VOID');

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "entryNumber" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "status" "JournalEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "journalEntryId" UUID NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "accountId" UUID NOT NULL,
    "debitAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "creditAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "journal_entries_tenantId_idx" ON "journal_entries"("tenantId");

-- CreateIndex
CREATE INDEX "journal_entries_tenantId_status_idx" ON "journal_entries"("tenantId", "status");

-- CreateIndex
CREATE INDEX "journal_entries_tenantId_entryDate_idx" ON "journal_entries"("tenantId", "entryDate");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_tenantId_entryNumber_key" ON "journal_entries"("tenantId", "entryNumber");

-- CreateIndex
CREATE INDEX "journal_lines_tenantId_idx" ON "journal_lines"("tenantId");

-- CreateIndex
CREATE INDEX "journal_lines_journalEntryId_idx" ON "journal_lines"("journalEntryId");

-- CreateIndex
CREATE INDEX "journal_lines_accountId_idx" ON "journal_lines"("accountId");

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
