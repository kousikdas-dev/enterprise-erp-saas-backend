import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AccountingJournalClient } from './accounting-journal.client';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10_000,
      maxRedirects: 0,
    }),
  ],
  providers: [AccountingJournalClient],
  exports: [AccountingJournalClient],
})
export class AccountingClientModule {}
