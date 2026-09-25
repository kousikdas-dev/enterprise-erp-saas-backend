import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared.module';
import { ListStateComponent } from '../../shared/list-state/list-state.component';
import { DecimalTextPipe, QuantityPipe } from '../../shared/pipes/decimal.pipes';
import { AccountsPayableListComponent } from './accounts-payable/accounts-payable-list.component';
import { GoodsReceiptListComponent } from './goods-receipts/goods-receipt-list.component';
import { PurchaseOrderListComponent } from './purchase-orders/purchase-order-list.component';
import { PurchaseInvoiceListComponent } from './purchase-invoices/purchase-invoice-list.component';
import { PurchaseReturnListComponent } from './purchase-returns/purchase-return-list.component';
import { SupplierListComponent } from './suppliers/supplier-list.component';

const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'suppliers' },
  {
    path: 'suppliers',
    component: SupplierListComponent,
    data: { extraParameter: 'purchaseMenu' },
  },
  {
    path: 'purchase-orders',
    component: PurchaseOrderListComponent,
    data: { extraParameter: 'purchaseMenu' },
  },
  {
    path: 'goods-receipts',
    component: GoodsReceiptListComponent,
    data: { extraParameter: 'purchaseMenu' },
  },
  {
    path: 'purchase-invoices',
    component: PurchaseInvoiceListComponent,
    data: { extraParameter: 'purchaseMenu' },
  },
  {
    path: 'purchase-returns',
    component: PurchaseReturnListComponent,
    data: { extraParameter: 'purchaseMenu' },
  },
  {
    path: 'accounts-payable',
    component: AccountsPayableListComponent,
    data: { extraParameter: 'purchaseMenu' },
  },
];

@NgModule({
  declarations: [
    SupplierListComponent,
    PurchaseOrderListComponent,
    GoodsReceiptListComponent,
    PurchaseInvoiceListComponent,
    PurchaseReturnListComponent,
    AccountsPayableListComponent,
  ],
  imports: [
    SharedModule,
    ListStateComponent,
    QuantityPipe,
    DecimalTextPipe,
    RouterModule.forChild(routes),
  ],
})
export class PurchaseFeatureModule {}
