import { Module } from '@nestjs/common';
import { ProformaInvoicesController } from './proforma-invoices.controller';
import { ProformaInvoicesService } from './proforma-invoices.service';

@Module({
  controllers: [ProformaInvoicesController],
  providers: [ProformaInvoicesService],
  exports: [ProformaInvoicesService],
})
export class ProformaInvoicesModule {}
