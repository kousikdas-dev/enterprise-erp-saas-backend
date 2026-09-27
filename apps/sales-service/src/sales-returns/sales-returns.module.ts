import { Module } from '@nestjs/common';
import { AccountingClientModule } from '../accounting/accounting-client.module';
import { InventoryClientModule } from '../inventory/inventory-client.module';
import { SalesReturnsController } from './sales-returns.controller';
import { SalesReturnsService } from './sales-returns.service';

// Mirrors PurchaseReturnsModule exactly: InventoryStockClient (applyReturn())
// and AccountingJournalClient (the post-commit, best-effort return-posting
// journal) are both needed by SalesReturnsService.
@Module({
  imports: [InventoryClientModule, AccountingClientModule],
  controllers: [SalesReturnsController],
  providers: [SalesReturnsService],
})
export class SalesReturnsModule {}
