import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared.module';
import { PlaceholderPageComponent } from '../../shared/placeholder-page/placeholder-page.component';

const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'suppliers' },
  {
    path: 'suppliers',
    component: PlaceholderPageComponent,
    data: {
      heading: 'Suppliers',
      subheading: 'Purchase suppliers',
      icon: 'pe-7s-id',
      phaseMessage: 'Coming in Frontend Phase 3 — supplier management.',
      extraParameter: 'purchaseMenu',
    },
  },
  {
    path: 'purchase-orders',
    component: PlaceholderPageComponent,
    data: {
      heading: 'Purchase Orders',
      subheading: 'Purchase orders',
      icon: 'pe-7s-shopbag',
      phaseMessage: 'Coming in Frontend Phase 3 — purchase order lifecycle.',
      extraParameter: 'purchaseMenu',
    },
  },
  {
    path: 'goods-receipts',
    component: PlaceholderPageComponent,
    data: {
      heading: 'Goods Receipts',
      subheading: 'Inventory posting receipts',
      icon: 'pe-7s-download',
      phaseMessage: 'Coming in Frontend Phase 3 — goods receipt posting.',
      extraParameter: 'purchaseMenu',
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
export class PurchaseFeatureModule {}
