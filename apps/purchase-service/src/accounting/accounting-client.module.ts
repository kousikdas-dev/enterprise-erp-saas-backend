import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AccountingJournalClient } from './accounting-journal.client';
import { AccountingLedgerClient } from './accounting-ledger.client';
import { AccountingTaxCodeClient } from './accounting-tax-code.client';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10_000,
      maxRedirects: 0,
    }),
  ],
  providers: [AccountingTaxCodeClient, AccountingJournalClient, AccountingLedgerClient],
  exports: [AccountingTaxCodeClient, AccountingJournalClient, AccountingLedgerClient],
})
export class AccountingClientModule {}
