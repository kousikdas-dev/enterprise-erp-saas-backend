import { Module } from '@nestjs/common';
import { InternalServiceGuard } from '../auth/internal-service.guard';
import { InternalStockReceiptsController } from './internal-stock-receipts.controller';
import { StockController } from './stock.controller';
import { StockReceiptsService } from './stock-receipts.service';
import { StockService } from './stock.service';

@Module({
  controllers: [StockController, InternalStockReceiptsController],
  providers: [StockService, StockReceiptsService, InternalServiceGuard],
  exports: [StockReceiptsService],
})
export class StockModule {}
