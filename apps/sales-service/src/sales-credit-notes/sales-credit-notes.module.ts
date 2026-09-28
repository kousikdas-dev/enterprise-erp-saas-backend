import { Module } from '@nestjs/common';
import { AccountingClientModule } from '../accounting/accounting-client.module';
import { SalesCreditNotesController } from './sales-credit-notes.controller';
import { SalesCreditNotesService } from './sales-credit-notes.service';

// Deliberately does NOT import InventoryClientModule: a Sales Credit Note
// never calls InventoryStockClient (no physical goods movement).
@Module({
  imports: [AccountingClientModule],
  controllers: [SalesCreditNotesController],
  providers: [SalesCreditNotesService],
})
export class SalesCreditNotesModule {}
