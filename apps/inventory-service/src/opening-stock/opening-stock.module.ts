import { Module } from '@nestjs/common';
import { AccountingClientModule } from '../accounting/accounting-client.module';
import { OpeningStockController } from './opening-stock.controller';
import { OpeningStockService } from './opening-stock.service';

@Module({
  imports: [AccountingClientModule],
  controllers: [OpeningStockController],
  providers: [OpeningStockService],
})
export class OpeningStockModule {}
