import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule, LoggingModule, validateEnv } from '@app/common';
import { MessagingModule } from '@app/messaging';
import { InventoryAuditModule } from './audit/inventory-audit.module';
import { AttributesModule } from './attributes/attributes.module';
import { CategoriesModule } from './categories/categories.module';
import { InventoryEnvironmentVariables } from './config/inventory-env';
import { OpeningStockModule } from './opening-stock/opening-stock.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductUnitsModule } from './product-units/product-units.module';
import { ProductsModule } from './products/products.module';
import { StockModule } from './stock/stock.module';
import { UnitsModule } from './units/units.module';
import { UnspscCategoriesModule } from './unspsc-categories/unspsc-categories.module';
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
    AttributesModule,
    CategoriesModule,
    UnitsModule,
    UnspscCategoriesModule,
    WarehousesModule,
    ProductsModule,
    ProductUnitsModule,
    StockModule,
    OpeningStockModule,
    MessagingModule.register(),
  ],
})
export class InventoryModule {}
