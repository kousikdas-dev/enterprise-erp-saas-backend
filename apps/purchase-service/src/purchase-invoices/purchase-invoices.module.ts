import { Module } from '@nestjs/common';
import { AccountingClientModule } from '../accounting/accounting-client.module';
import { PurchaseInvoicesController } from './purchase-invoices.controller';
import { PurchaseInvoicesService } from './purchase-invoices.service';

// No InventoryClientModule needed: UOM is never re-resolved (copied from
// GoodsReceiptItem/PurchaseOrderItem) and tax is copied forward from
// PurchaseOrderItem rather than re-resolved via AccountingTaxCodeClient
// (Section 22 Decision C) — PrismaService and IdentityAuditClient are both
// @Global() already. AccountingClientModule IS needed as of Phase C1/C2:
// AccountingJournalClient posts/reverses journal entries after confirm()/
// recordPayment()/cancel() commit their own transaction.
@Module({
  imports: [AccountingClientModule],
  controllers: [PurchaseInvoicesController],
  providers: [PurchaseInvoicesService],
})
export class PurchaseInvoicesModule {}
