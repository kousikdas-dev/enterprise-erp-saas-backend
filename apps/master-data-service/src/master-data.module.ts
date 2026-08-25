import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule, LoggingModule, validateEnv } from '@app/common';
import { MessagingModule } from '@app/messaging';
import { MasterDataAuditModule } from './audit/master-data-audit.module';
import { MasterDataEnvironmentVariables } from './config/master-data-env';
import { PrismaModule } from './prisma/prisma.module';
import { PaymentTermsModule } from './payment-terms/payment-terms.module';
import { PaymentMethodsModule } from './payment-methods/payment-methods.module';
import { FiscalPositionsModule } from './fiscal-positions/fiscal-positions.module';
import { IndustriesModule } from './industries/industries.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      validate: (config) =>
        validateEnv(MasterDataEnvironmentVariables, config),
    }),
    LoggingModule,
    HealthModule,
    PrismaModule,
    MasterDataAuditModule,
    PaymentTermsModule,
    PaymentTermsModule,
    PaymentMethodsModule,
    FiscalPositionsModule,
    IndustriesModule,
    MessagingModule.register(),
  ],
})
export class MasterDataModule {}
