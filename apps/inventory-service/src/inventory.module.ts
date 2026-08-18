import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule, LoggingModule, validateEnv } from '@app/common';
import { MessagingModule } from '@app/messaging';
import { InventoryAuditModule } from './audit/inventory-audit.module';
import { CategoriesModule } from './categories/categories.module';
import { InventoryEnvironmentVariables } from './config/inventory-env';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { StockModule } from './stock/stock.module';
import { UnitsModule } from './units/units.module';
import { WarehousesModule } from './warehouses/warehouses.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      validate: (config) => validateEnv(InventoryEnvironmentVariables, config),
    }),
    LoggingModule,
    HealthModule,
    PrismaModule,
    InventoryAuditModule,
    CategoriesModule,
    UnitsModule,
    WarehousesModule,
    ProductsModule,
    StockModule,
    MessagingModule.register(),
  ],
})
export class InventoryModule {}
