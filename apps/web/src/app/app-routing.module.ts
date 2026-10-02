import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { BaseLayoutComponent } from './Layout/base-layout/base-layout.component';
import { PagesLayoutComponent } from './Layout/pages-layout/pages-layout.component';
import { authGuard } from './core/guards/auth.guard';

import { LoginBoxedComponent } from './components.barrel';

const routes: Routes = [
  {
    path: 'auth',
    component: PagesLayoutComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'login' },
      {
        path: 'login',
        component: LoginBoxedComponent,
        data: { extraParameter: '' },
      },
    ],
  },
  {
    path: '',
    component: BaseLayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },

      {
        path: 'dashboard',
        loadChildren: () =>
          import('./features/dashboard/dashboard.module').then(
            (m) => m.DashboardFeatureModule,
          ),
      },
      {
        path: 'sales',
        loadChildren: () =>
          import('./features/sales/sales.module').then(
            (m) => m.SalesFeatureModule,
          ),
      },
      {
        path: 'purchase',
        loadChildren: () =>
          import('./features/purchase/purchase.module').then(
            (m) => m.PurchaseFeatureModule,
          ),
      },
      {
        path: 'inventory',
        loadChildren: () =>
          import('./features/inventory/inventory.module').then(
            (m) => m.InventoryFeatureModule,
          ),
      },
      {
        path: 'accounting',
        loadChildren: () =>
          import('./features/accounting/accounting.module').then(
            (m) => m.AccountingFeatureModule,
          ),
      },
      {
        path: 'production',
        loadChildren: () =>
          import('./features/production/production.module').then(
            (m) => m.ProductionFeatureModule,
          ),
      },
      {
        path: 'admin',
        loadChildren: () =>
          import('./features/administration/administration.module').then(
            (m) => m.AdministrationFeatureModule,
          ),
      },
      {
        path: 'audit',
        loadChildren: () =>
          import('./features/audit/audit.module').then(
            (m) => m.AuditFeatureModule,
          ),
      },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, {
      scrollPositionRestoration: 'enabled',
      anchorScrolling: 'enabled',
    }),
  ],
  exports: [RouterModule],
})
export class AppRoutingModule {}
