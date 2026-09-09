import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { InventoryProductClient } from './inventory-product.client';
import { InventoryStockClient } from './inventory-stock.client';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10_000,
      maxRedirects: 0,
    }),
  ],
  providers: [InventoryStockClient, InventoryProductClient],
  exports: [InventoryStockClient, InventoryProductClient],
})
export class InventoryClientModule {}
