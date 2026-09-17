import { Module } from '@nestjs/common';
import { PurchaseInvoicesController } from './purchase-invoices.controller';
import { PurchaseInvoicesService } from './purchase-invoices.service';

// No InventoryClientModule/AccountingClientModule import needed: UOM is
// never re-resolved (copied from GoodsReceiptItem/PurchaseOrderItem) and
// tax is copied forward from PurchaseOrderItem rather than re-resolved via
// AccountingTaxCodeClient (Section 22 Decision C) — PrismaService and
// IdentityAuditClient are both @Global() already.
@Module({
  controllers: [PurchaseInvoicesController],
  providers: [PurchaseInvoicesService],
})
export class PurchaseInvoicesModule {}
