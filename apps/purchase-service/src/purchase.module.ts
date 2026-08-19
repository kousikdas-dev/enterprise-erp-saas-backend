import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule, LoggingModule, validateEnv } from '@app/common';
import { MessagingModule } from '@app/messaging';
import { PurchaseAuditModule } from './audit/purchase-audit.module';
import { PurchaseEnvironmentVariables } from './config/purchase-env';
import { PrismaModule } from './prisma/prisma.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { GoodsReceiptsModule } from './goods-receipts/goods-receipts.module';
import { SuppliersModule } from './suppliers/suppliers.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      validate: (config) => validateEnv(PurchaseEnvironmentVariables, config),
    }),
    LoggingModule,
    HealthModule,
    PrismaModule,
    PurchaseAuditModule,
    SuppliersModule,
    PurchaseOrdersModule,
    GoodsReceiptsModule,
    MessagingModule.register(),
  ],
})
export class PurchaseModule {}
