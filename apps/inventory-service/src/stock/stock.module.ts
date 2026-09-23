import { Module } from '@nestjs/common';
import { InternalServiceGuard } from '../auth/internal-service.guard';
import { InternalStockIssuesController } from './internal-stock-issues.controller';
import { InternalStockReceiptsController } from './internal-stock-receipts.controller';
import { InternalStockReturnsController } from './internal-stock-returns.controller';
import { StockController } from './stock.controller';
import { StockIssuesService } from './stock-issues.service';
import { StockReceiptsService } from './stock-receipts.service';
import { StockReturnsService } from './stock-returns.service';
import { StockService } from './stock.service';

@Module({
  controllers: [
    StockController,
    InternalStockReceiptsController,
    InternalStockIssuesController,
    InternalStockReturnsController,
  ],
  providers: [
    StockService,
    StockReceiptsService,
    StockIssuesService,
    StockReturnsService,
    InternalServiceGuard,
  ],
  exports: [StockReceiptsService, StockIssuesService, StockReturnsService],
})
export class StockModule {}
