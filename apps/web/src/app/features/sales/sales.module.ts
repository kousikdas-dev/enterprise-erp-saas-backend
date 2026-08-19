import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared.module';
import { PlaceholderPageComponent } from '../../shared/placeholder-page/placeholder-page.component';

const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'customers' },
  {
    path: 'customers',
    component: PlaceholderPageComponent,
    data: {
      heading: 'Customers',
      subheading: 'Sales customers',
      icon: 'pe-7s-users',
      phaseMessage: 'Coming in Frontend Phase 2 — customer list and forms.',
      extraParameter: 'salesMenu',
    },
  },
  {
    path: 'quotations',
    component: PlaceholderPageComponent,
    data: {
      heading: 'Quotations',
      subheading: 'Sales quotations',
      icon: 'pe-7s-note2',
      phaseMessage: 'Coming in Frontend Phase 2 — quotation lifecycle UI.',
      extraParameter: 'salesMenu',
    },
  },
  {
    path: 'proforma-invoices',
    component: PlaceholderPageComponent,
    data: {
      heading: 'Proforma Invoices',
      subheading: 'Commercial proforma documents',
      icon: 'pe-7s-news-paper',
      phaseMessage: 'Coming in Frontend Phase 2 — proforma list and detail.',
      extraParameter: 'salesMenu',
    },
  },
  {
    path: 'sales-orders',
    component: PlaceholderPageComponent,
    data: {
      heading: 'Sales Orders',
      subheading: 'Confirmed sales orders',
      icon: 'pe-7s-cart',
      phaseMessage: 'Coming in Frontend Phase 2 — sales order management.',
      extraParameter: 'salesMenu',
    },
  },
  {
    path: 'shipments',
    component: PlaceholderPageComponent,
    data: {
      heading: 'Shipments',
      subheading: 'Stock posting shipments',
      icon: 'pe-7s-box2',
      phaseMessage: 'Coming in Frontend Phase 2 — shipment create and post.',
      extraParameter: 'salesMenu',
    },
  },
];

@NgModule({
  imports: [
    SharedModule,
    PlaceholderPageComponent,
    RouterModule.forChild(routes),
  ],
})
export class SalesFeatureModule {}
