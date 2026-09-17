import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { GoodsReceiptsController } from './goods-receipts.controller';
import { PurchaseForwardService } from './purchase-forward.service';
import { PurchaseInvoicesController } from './purchase-invoices.controller';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { SupplierAddressesController } from './supplier-addresses.controller';
import { SuppliersController } from './suppliers.controller';

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
    SuppliersController,
    SupplierAddressesController,
    PurchaseOrdersController,
    GoodsReceiptsController,
    PurchaseInvoicesController,
  ],
  providers: [PurchaseForwardService],
})
export class PurchaseAdminModule {}
