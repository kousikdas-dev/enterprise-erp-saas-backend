import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { CategoriesController } from './categories.controller';
import { InventoryForwardService } from './inventory-forward.service';
import { ProductsController } from './products.controller';
import { StockController } from './stock.controller';
import { UnitsController } from './units.controller';
import { WarehousesController } from './warehouses.controller';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10_000,
      maxRedirects: 0,
    }),
    AuthModule,
    RbacModule,
  ],
  controllers: [
    CategoriesController,
    UnitsController,
    WarehousesController,
    ProductsController,
    StockController,
  ],
  providers: [InventoryForwardService],
})
export class InventoryAdminModule {}
