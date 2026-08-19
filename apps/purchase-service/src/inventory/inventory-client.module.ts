import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { InventoryStockClient } from './inventory-stock.client';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10_000,
      maxRedirects: 0,
    }),
  ],
  providers: [InventoryStockClient],
  exports: [InventoryStockClient],
})
export class InventoryClientModule {}
