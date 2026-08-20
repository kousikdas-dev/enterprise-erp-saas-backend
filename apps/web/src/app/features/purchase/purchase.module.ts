import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared.module';
import { ListStateComponent } from '../../shared/list-state/list-state.component';
import { DecimalTextPipe, QuantityPipe } from '../../shared/pipes/decimal.pipes';
import { GoodsReceiptListComponent } from './goods-receipts/goods-receipt-list.component';
import { PurchaseOrderListComponent } from './purchase-orders/purchase-order-list.component';
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
];

@NgModule({
  declarations: [
    SupplierListComponent,
    PurchaseOrderListComponent,
    GoodsReceiptListComponent,
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
