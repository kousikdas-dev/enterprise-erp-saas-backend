import { forwardRef, Module } from '@nestjs/common';
import { AccountingClientModule } from '../accounting/accounting-client.module';
import { CustomersModule } from '../customers/customers.module';
import { InventoryClientModule } from '../inventory/inventory-client.module';
import { ProformaInvoicesModule } from '../proforma-invoices/proforma-invoices.module';
import { SalesInvoicesModule } from '../sales-invoices/sales-invoices.module';
import { SalesOrdersController } from './sales-orders.controller';
import { SalesOrdersService } from './sales-orders.service';

@Module({
  imports: [
    CustomersModule,
    forwardRef(() => ProformaInvoicesModule),
    SalesInvoicesModule,
    InventoryClientModule,
    AccountingClientModule,
  ],
  controllers: [SalesOrdersController],
  providers: [SalesOrdersService],
  exports: [SalesOrdersService],
})
export class SalesOrdersModule {}
