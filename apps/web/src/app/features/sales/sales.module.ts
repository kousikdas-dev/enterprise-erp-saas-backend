import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared.module';
import { ListStateComponent } from '../../shared/list-state/list-state.component';
import { CustomerListComponent } from './customers/customer-list.component';
import { ProformaInvoiceListComponent } from './proforma-invoices/proforma-invoice-list.component';
import { QuotationListComponent } from './quotations/quotation-list.component';
import { SalesInvoiceListComponent } from './sales-invoices/sales-invoice-list.component';
import { SalesOrderListComponent } from './sales-orders/sales-order-list.component';
import { ShipmentListComponent } from './shipments/shipment-list.component';

const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'customers' },
  {
    path: 'customers',
    component: CustomerListComponent,
    data: { extraParameter: 'salesMenu' },
  },
  {
    path: 'quotations',
    component: QuotationListComponent,
    data: { extraParameter: 'salesMenu' },
  },
  {
    path: 'proforma-invoices',
    component: ProformaInvoiceListComponent,
    data: { extraParameter: 'salesMenu' },
  },
  {
    path: 'sales-orders',
    component: SalesOrderListComponent,
    data: { extraParameter: 'salesMenu' },
  },
  {
    path: 'sales-invoices',
    component: SalesInvoiceListComponent,
    data: { extraParameter: 'salesMenu' },
  },
  {
    path: 'shipments',
    component: ShipmentListComponent,
    data: { extraParameter: 'salesMenu' },
  },
];

@NgModule({
  declarations: [
    CustomerListComponent,
    QuotationListComponent,
    ProformaInvoiceListComponent,
    SalesOrderListComponent,
    SalesInvoiceListComponent,
    ShipmentListComponent,
  ],
  imports: [SharedModule, ListStateComponent, RouterModule.forChild(routes)],
})
export class SalesFeatureModule {}
