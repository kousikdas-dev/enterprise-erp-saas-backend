import { Module } from '@nestjs/common';
import { InventoryClientModule } from '../inventory/inventory-client.module';
import { GoodsReceiptsController } from './goods-receipts.controller';
import { GoodsReceiptsService } from './goods-receipts.service';

@Module({
  imports: [InventoryClientModule],
  controllers: [GoodsReceiptsController],
  providers: [GoodsReceiptsService],
})
export class GoodsReceiptsModule {}
