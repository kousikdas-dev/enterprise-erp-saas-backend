import { Module } from '@nestjs/common';
import { AccountingClientModule } from '../accounting/accounting-client.module';
import { CustomersModule } from '../customers/customers.module';
import { InventoryClientModule } from '../inventory/inventory-client.module';
import { ProformaInvoicesModule } from '../proforma-invoices/proforma-invoices.module';
import { SalesOrdersModule } from '../sales-orders/sales-orders.module';
import { QuotationsController } from './quotations.controller';
import { QuotationsService } from './quotations.service';

@Module({
  imports: [
    CustomersModule,
    ProformaInvoicesModule,
    SalesOrdersModule,
    InventoryClientModule,
    AccountingClientModule,
  ],
  controllers: [QuotationsController],
  providers: [QuotationsService],
  exports: [QuotationsService],
})
export class QuotationsModule {}
