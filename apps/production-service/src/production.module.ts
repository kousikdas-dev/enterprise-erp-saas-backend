import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule, LoggingModule, validateEnv } from '@app/common';
import { MessagingModule } from '@app/messaging';
import { BillOfMaterialsModule } from './bill-of-materials/bill-of-materials.module';
import { ProductionEnvironmentVariables } from './config/production-env';
import { OperationsModule } from './operations/operations.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductionOrdersModule } from './production-orders/production-orders.module';
import { WorkCentresModule } from './work-centres/work-centres.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      validate: (config) => validateEnv(ProductionEnvironmentVariables, config),
    }),
    LoggingModule,
    HealthModule,
    PrismaModule,
    BillOfMaterialsModule,
    OperationsModule,
    WorkCentresModule,
    ProductionOrdersModule,
    MessagingModule.register(),
  ],
})
export class ProductionModule {}
