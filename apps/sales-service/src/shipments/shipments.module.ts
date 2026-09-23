import { Module } from '@nestjs/common';
import { AccountingClientModule } from '../accounting/accounting-client.module';
import { InventoryClientModule } from '../inventory/inventory-client.module';
import { ShipmentsController } from './shipments.controller';
import { ShipmentsService } from './shipments.service';

// AccountingClientModule is needed as of Phase 3.3 (Sales Shipment COGS):
// AccountingJournalClient posts a COGS/Inventory-Asset journal entry after
// finalizePosted() commits its own transaction (mirrors GoodsReceiptsModule's
// exact reason for importing this module on the Purchase side).
@Module({
  imports: [InventoryClientModule, AccountingClientModule],
  controllers: [ShipmentsController],
  providers: [ShipmentsService],
  exports: [ShipmentsService],
})
export class ShipmentsModule {}
