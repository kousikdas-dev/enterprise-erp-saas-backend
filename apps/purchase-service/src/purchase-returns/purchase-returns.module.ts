import { Module } from '@nestjs/common';
import { AccountingClientModule } from '../accounting/accounting-client.module';
import { InventoryClientModule } from '../inventory/inventory-client.module';
import { PurchaseReturnsController } from './purchase-returns.controller';
import { PurchaseReturnsService } from './purchase-returns.service';

// Mirrors GoodsReceiptsModule exactly: InventoryStockClient (applyReturn())
// and AccountingJournalClient (the post-commit, best-effort return-posting
// journal) are both needed by PurchaseReturnsService.
@Module({
  imports: [InventoryClientModule, AccountingClientModule],
  controllers: [PurchaseReturnsController],
  providers: [PurchaseReturnsService],
})
export class PurchaseReturnsModule {}
