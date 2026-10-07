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
import { PurchaseDebitNoteListComponent } from './purchase-debit-notes/purchase-debit-note-list.component';
import { SupplierListComponent } from './suppliers/supplier-list.component';
import { PurchaseSettingsComponent } from './settings/purchase-settings.component';
import { PurchaseOverviewComponent } from './overview/purchase-overview.component';

const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'overview' },
  {
    path: 'overview',
    component: PurchaseOverviewComponent,
    data: { extraParameter: 'purchaseMenu', darkTheme: true },
  },
  {
    path: 'settings',
    component: PurchaseSettingsComponent,
    data: { extraParameter: 'purchaseMenu', darkTheme: true },
  },
  {
    path: 'suppliers',
    component: SupplierListComponent,
    data: { extraParameter: 'purchaseMenu', darkTheme: true },
  },
  {
    path: 'purchase-orders',
    component: PurchaseOrderListComponent,
    data: { extraParameter: 'purchaseMenu', darkTheme: true },
  },
  {
    path: 'goods-receipts',
    component: GoodsReceiptListComponent,
    data: { extraParameter: 'purchaseMenu', darkTheme: true },
  },
  {
    path: 'purchase-invoices',
    component: PurchaseInvoiceListComponent,
    data: { extraParameter: 'purchaseMenu', darkTheme: true },
  },
  {
    path: 'purchase-returns',
    component: PurchaseReturnListComponent,
    data: { extraParameter: 'purchaseMenu', darkTheme: true },
  },
  {
    path: 'purchase-debit-notes',
    component: PurchaseDebitNoteListComponent,
    data: { extraParameter: 'purchaseMenu', darkTheme: true },
  },
  {
    path: 'accounts-payable',
    component: AccountsPayableListComponent,
    data: { extraParameter: 'purchaseMenu', darkTheme: true },
  },
];

@NgModule({
  declarations: [
    PurchaseOverviewComponent,
    SupplierListComponent,
    PurchaseOrderListComponent,
    GoodsReceiptListComponent,
    PurchaseInvoiceListComponent,
    PurchaseReturnListComponent,
    PurchaseDebitNoteListComponent,
    AccountsPayableListComponent,
    PurchaseSettingsComponent,
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
