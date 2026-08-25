import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { CustomerAddressesController } from './customer-addresses.controller';
import { CustomersController } from './customers.controller';
import { ProformaInvoicesController } from './proforma-invoices.controller';
import { QuotationsController } from './quotations.controller';
import { SalesForwardService } from './sales-forward.service';
import { SalesOrdersController } from './sales-orders.controller';
import { ShipmentsController } from './shipments.controller';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10_000,
      maxRedirects: 0,
    }),
    AuthModule,
    RbacModule,
  ],
  controllers: [
    CustomersController,
    CustomerAddressesController,
    QuotationsController,
    ProformaInvoicesController,
    SalesOrdersController,
    ShipmentsController,
  ],
  providers: [SalesForwardService],
})
export class SalesAdminModule {}