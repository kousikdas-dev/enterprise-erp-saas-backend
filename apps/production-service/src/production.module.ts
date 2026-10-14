import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule, LoggingModule, validateEnv } from '@app/common';
import { MessagingModule } from '@app/messaging';
import { BillOfMaterialsModule } from './bill-of-materials/bill-of-materials.module';
import { ProductionEnvironmentVariables } from './config/production-env';
import { OperationsModule } from './operations/operations.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductionOrdersModule } from './production-orders/production-orders.module';
import { RoutingsModule } from './routings/routings.module';
import { UnbuildOrdersModule } from './unbuild-orders/unbuild-orders.module';
import { WorkCentresModule } from './work-centres/work-centres.module';
import { WorkOrdersModule } from './work-orders/work-orders.module';

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
    WorkOrdersModule,
    RoutingsModule,
    UnbuildOrdersModule,
    MessagingModule.register(),
  ],
})
export class ProductionModule {}
