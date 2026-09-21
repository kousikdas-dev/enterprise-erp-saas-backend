import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule, LoggingModule, validateEnv } from '@app/common';
import { MessagingModule } from '@app/messaging';
import { AccountingAuditModule } from './audit/accounting-audit.module';
import { AccountMappingsModule } from './account-mappings/account-mappings.module';
import { AccountsModule } from './accounts/accounts.module';
import { AccountingEnvironmentVariables } from './config/accounting-env';
import { JournalEntriesModule } from './journal-entries/journal-entries.module';
import { JournalPostingsModule } from './journal-postings/journal-postings.module';
import { PrismaModule } from './prisma/prisma.module';
import { TaxCodesModule } from './tax-codes/tax-codes.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      validate: (config) => validateEnv(AccountingEnvironmentVariables, config),
    }),
    LoggingModule,
    HealthModule,
    PrismaModule,
    AccountingAuditModule,
    AccountsModule,
    AccountMappingsModule,
    JournalEntriesModule,
    JournalPostingsModule,
    TaxCodesModule,
    MessagingModule.register(),
  ],
})
export class AccountingModule {}
