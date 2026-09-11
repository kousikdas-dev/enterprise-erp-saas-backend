import { Module } from '@nestjs/common';
import { MessagingModule } from '@app/messaging';
import { AccountingClientModule } from '../accounting/accounting-client.module';
import { CustomersModule } from '../customers/customers.module';
import { InventoryClientModule } from '../inventory/inventory-client.module';
import { SalesInvoicesController } from './sales-invoices.controller';
import { SalesInvoicesService } from './sales-invoices.service';

@Module({
  imports: [
    CustomersModule,
    MessagingModule.register(),
    InventoryClientModule,
    AccountingClientModule,
  ],
  controllers: [SalesInvoicesController],
  providers: [SalesInvoicesService],
  exports: [SalesInvoicesService],
})
export class SalesInvoicesModule {}
