import { Module } from '@nestjs/common';
import { AccountingClientModule } from '../accounting/accounting-client.module';
import { InventoryClientModule } from '../inventory/inventory-client.module';
import { GoodsReceiptsController } from './goods-receipts.controller';
import { GoodsReceiptsService } from './goods-receipts.service';

// AccountingClientModule is needed as of Phase 3.1 (GRNI Accounting):
// AccountingJournalClient posts a GRNI accrual journal entry after
// finalizePosted() commits its own transaction (mirrors
// PurchaseInvoicesModule's exact reason for importing this module).
@Module({
  imports: [InventoryClientModule, AccountingClientModule],
  controllers: [GoodsReceiptsController],
  providers: [GoodsReceiptsService],
})
export class GoodsReceiptsModule {}
