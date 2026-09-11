import { forwardRef, Module } from '@nestjs/common';
import { AccountingClientModule } from '../accounting/accounting-client.module';
import { InventoryClientModule } from '../inventory/inventory-client.module';
import { SalesInvoicesModule } from '../sales-invoices/sales-invoices.module';
import { SalesOrdersModule } from '../sales-orders/sales-orders.module';
import { ProformaInvoicesController } from './proforma-invoices.controller';
import { ProformaInvoicesService } from './proforma-invoices.service';

@Module({
  imports: [
    SalesInvoicesModule,
    forwardRef(() => SalesOrdersModule),
    InventoryClientModule,
    AccountingClientModule,
  ],
  controllers: [ProformaInvoicesController],
  providers: [ProformaInvoicesService],
  exports: [ProformaInvoicesService],
})
export class ProformaInvoicesModule {}
