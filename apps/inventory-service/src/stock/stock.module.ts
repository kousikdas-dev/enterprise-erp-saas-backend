import { Module } from '@nestjs/common';
import { InternalServiceGuard } from '../auth/internal-service.guard';
import { InternalStockIssuesController } from './internal-stock-issues.controller';
import { InternalStockReceiptsController } from './internal-stock-receipts.controller';
import { StockController } from './stock.controller';
import { StockIssuesService } from './stock-issues.service';
import { StockReceiptsService } from './stock-receipts.service';
import { StockService } from './stock.service';

@Module({
  controllers: [
    StockController,
    InternalStockReceiptsController,
    InternalStockIssuesController,
  ],
  providers: [
    StockService,
    StockReceiptsService,
    StockIssuesService,
    InternalServiceGuard,
  ],
  exports: [StockReceiptsService, StockIssuesService],
})
export class StockModule {}
