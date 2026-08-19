import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule, LoggingModule, validateEnv } from '@app/common';
import { MessagingModule } from '@app/messaging';
import { SalesAuditModule } from './audit/sales-audit.module';
import { SalesEnvironmentVariables } from './config/sales-env';
import { CustomersModule } from './customers/customers.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProformaInvoicesModule } from './proforma-invoices/proforma-invoices.module';
import { QuotationsModule } from './quotations/quotations.module';
import { SalesOrdersModule } from './sales-orders/sales-orders.module';
import { ShipmentsModule } from './shipments/shipments.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      validate: (config) => validateEnv(SalesEnvironmentVariables, config),
    }),
    LoggingModule,
    HealthModule,
    PrismaModule,
    SalesAuditModule,
    CustomersModule,
    QuotationsModule,
    ProformaInvoicesModule,
    SalesOrdersModule,
    ShipmentsModule,
    MessagingModule.register(),
  ],
})
export class SalesModule {}
