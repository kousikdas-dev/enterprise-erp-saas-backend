import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { InventoryProductClient } from './inventory-product.client';
import { InventoryWarehouseClient } from './inventory-warehouse.client';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10_000,
      maxRedirects: 0,
    }),
  ],
  providers: [InventoryProductClient, InventoryWarehouseClient],
  exports: [InventoryProductClient, InventoryWarehouseClient],
})
export class InventoryClientModule {}
