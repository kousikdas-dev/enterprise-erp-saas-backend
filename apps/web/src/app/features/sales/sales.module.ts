import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared.module';
import { ListStateComponent } from '../../shared/list-state/list-state.component';
import { DecimalTextPipe, QuantityPipe } from '../../shared/pipes/decimal.pipes';
import { AccountsReceivableListComponent } from './accounts-receivable/accounts-receivable-list.component';
import { CustomerListComponent } from './customers/customer-list.component';
import { ProformaInvoiceListComponent } from './proforma-invoices/proforma-invoice-list.component';
import { QuotationListComponent } from './quotations/quotation-list.component';
import { SalesInvoiceListComponent } from './sales-invoices/sales-invoice-list.component';
import { SalesOrderListComponent } from './sales-orders/sales-order-list.component';
import { SalesReturnListComponent } from './sales-returns/sales-return-list.component';
import { SalesCreditNoteListComponent } from './sales-credit-notes/sales-credit-note-list.component';
import { ShipmentListComponent } from './shipments/shipment-list.component';
import { SalesSettingsComponent } from './settings/sales-settings.component';
import { PricelistListComponent } from './pricelists/pricelist-list.component';
import { DeliveryMethodListComponent } from './delivery-methods/delivery-method-list.component';
import { SalesOverviewComponent } from './overview/sales-overview.component';

const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'overview' },
  {
    path: 'overview',
    component: SalesOverviewComponent,
    data: { extraParameter: 'salesMenu', darkTheme: true },
  },
  {
    path: 'customers',
    component: CustomerListComponent,
    data: { extraParameter: 'salesMenu', darkTheme: true },
  },
  {
    path: 'quotations',
    component: QuotationListComponent,
    data: { extraParameter: 'salesMenu', darkTheme: true },
  },
  {
    path: 'proforma-invoices',
    component: ProformaInvoiceListComponent,
    data: { extraParameter: 'salesMenu', darkTheme: true },
  },
  {
    path: 'sales-orders',
    component: SalesOrderListComponent,
    data: { extraParameter: 'salesMenu', darkTheme: true },
  },
  {
    path: 'sales-invoices',
    component: SalesInvoiceListComponent,
    data: { extraParameter: 'salesMenu', darkTheme: true },
  },
  {
    path: 'shipments',
    component: ShipmentListComponent,
    data: { extraParameter: 'salesMenu', darkTheme: true },
  },
  {
    path: 'sales-returns',
    component: SalesReturnListComponent,
    data: { extraParameter: 'salesMenu', darkTheme: true },
  },
  {
    path: 'sales-credit-notes',
    component: SalesCreditNoteListComponent,
    data: { extraParameter: 'salesMenu', darkTheme: true },
  },
  {
    path: 'accounts-receivable',
    component: AccountsReceivableListComponent,
    data: { extraParameter: 'salesMenu', darkTheme: true },
  },
  {
    path: 'settings',
    component: SalesSettingsComponent,
    data: { extraParameter: 'salesMenu', darkTheme: true },
  },
  {
    path: 'pricelists',
    component: PricelistListComponent,
    data: { extraParameter: 'salesMenu', darkTheme: true },
  },
  {
    path: 'delivery-methods',
    component: DeliveryMethodListComponent,
    data: { extraParameter: 'salesMenu', darkTheme: true },
  },
];

@NgModule({
  declarations: [
    SalesOverviewComponent,
    CustomerListComponent,
    QuotationListComponent,
    ProformaInvoiceListComponent,
    SalesOrderListComponent,
    SalesInvoiceListComponent,
    ShipmentListComponent,
    SalesReturnListComponent,
    SalesCreditNoteListComponent,
    AccountsReceivableListComponent,
    SalesSettingsComponent,
    PricelistListComponent,
    DeliveryMethodListComponent,
  ],
  imports: [
    SharedModule,
    ListStateComponent,
    QuantityPipe,
    DecimalTextPipe,
    RouterModule.forChild(routes),
  ],
})
export class SalesFeatureModule {}
