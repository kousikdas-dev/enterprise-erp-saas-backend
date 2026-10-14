import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { InventoryProductClient } from './inventory-product.client';
import { InventoryUnbuildClient } from './inventory-unbuild.client';
import { InventoryWarehouseClient } from './inventory-warehouse.client';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10_000,
      maxRedirects: 0,
    }),
  ],
  providers: [InventoryProductClient, InventoryWarehouseClient, InventoryUnbuildClient],
  exports: [InventoryProductClient, InventoryWarehouseClient, InventoryUnbuildClient],
})
export class InventoryClientModule {}
