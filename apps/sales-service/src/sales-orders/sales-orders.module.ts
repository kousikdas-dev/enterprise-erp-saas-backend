import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { ProformaInvoicesModule } from '../proforma-invoices/proforma-invoices.module';
import { SalesOrdersController } from './sales-orders.controller';
import { SalesOrdersService } from './sales-orders.service';

@Module({
  imports: [CustomersModule, ProformaInvoicesModule],
  controllers: [SalesOrdersController],
  providers: [SalesOrdersService],
  exports: [SalesOrdersService],
})
export class SalesOrdersModule {}
