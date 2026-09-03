import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { ProformaInvoicesModule } from '../proforma-invoices/proforma-invoices.module';
import { SalesInvoicesModule } from '../sales-invoices/sales-invoices.module';
import { SalesOrdersController } from './sales-orders.controller';
import { SalesOrdersService } from './sales-orders.service';

@Module({
  imports: [CustomersModule, ProformaInvoicesModule, SalesInvoicesModule],
  controllers: [SalesOrdersController],
  providers: [SalesOrdersService],
  exports: [SalesOrdersService],
})
export class SalesOrdersModule {}
