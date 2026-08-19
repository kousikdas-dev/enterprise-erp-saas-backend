import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { ProformaInvoicesModule } from '../proforma-invoices/proforma-invoices.module';
import { SalesOrdersModule } from '../sales-orders/sales-orders.module';
import { QuotationsController } from './quotations.controller';
import { QuotationsService } from './quotations.service';

@Module({
  imports: [CustomersModule, ProformaInvoicesModule, SalesOrdersModule],
  controllers: [QuotationsController],
  providers: [QuotationsService],
  exports: [QuotationsService],
})
export class QuotationsModule {}
