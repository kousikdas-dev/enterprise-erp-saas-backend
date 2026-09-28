import { Module } from '@nestjs/common';
import { AccountingClientModule } from '../accounting/accounting-client.module';
import { PurchaseDebitNotesController } from './purchase-debit-notes.controller';
import { PurchaseDebitNotesService } from './purchase-debit-notes.service';

// Deliberately does NOT import InventoryClientModule: a Purchase Debit Note
// never calls InventoryStockClient (no physical goods movement).
@Module({
  imports: [AccountingClientModule],
  controllers: [PurchaseDebitNotesController],
  providers: [PurchaseDebitNotesService],
})
export class PurchaseDebitNotesModule {}
