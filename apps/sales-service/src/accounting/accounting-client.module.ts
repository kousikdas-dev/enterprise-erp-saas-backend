import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AccountingTaxCodeClient } from './accounting-tax-code.client';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10_000,
      maxRedirects: 0,
    }),
  ],
  providers: [AccountingTaxCodeClient],
  exports: [AccountingTaxCodeClient],
})
export class AccountingClientModule {}
