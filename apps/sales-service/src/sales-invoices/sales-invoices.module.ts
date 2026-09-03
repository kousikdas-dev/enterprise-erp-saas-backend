import { Module } from '@nestjs/common';
import { MessagingModule } from '@app/messaging';
import { CustomersModule } from '../customers/customers.module';
import { SalesInvoicesController } from './sales-invoices.controller';
import { SalesInvoicesService } from './sales-invoices.service';

@Module({
  imports: [CustomersModule, MessagingModule.register()],
  controllers: [SalesInvoicesController],
  providers: [SalesInvoicesService],
  exports: [SalesInvoicesService],
})
export class SalesInvoicesModule {}
