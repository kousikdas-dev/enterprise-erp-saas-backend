-- Account Ledger V1 — two additive indexes supporting the ledger query's
-- WHERE (tenantId, accountId) on journal_lines and WHERE (tenantId,
-- status='POSTED', entryDate range) on journal_entries in a single index
-- scan. These were applied to the dev database via `prisma db push` when
-- the Account Ledger feature was built; this migration file retroactively
-- records that already-applied change in migration history (no schema or
-- data change results from applying it — see the resolve step used when
-- this file was added). Purely additive — no existing column, table, or
-- enum value is touched.

-- CreateIndex
CREATE INDEX "journal_entries_tenantId_status_entryDate_idx" ON "journal_entries"("tenantId", "status", "entryDate");

-- CreateIndex
CREATE INDEX "journal_lines_tenantId_accountId_idx" ON "journal_lines"("tenantId", "accountId");
