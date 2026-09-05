import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule, LoggingModule, validateEnv } from '@app/common';
import { MessagingModule } from '@app/messaging';
import { AccountingAuditModule } from './audit/accounting-audit.module';
import { AccountsModule } from './accounts/accounts.module';
import { AccountingEnvironmentVariables } from './config/accounting-env';
import { PrismaModule } from './prisma/prisma.module';

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
    MessagingModule.register(),
  ],
})
export class AccountingModule {}
