import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { BaseLayoutComponent } from './Layout/base-layout/base-layout.component';
import { PagesLayoutComponent } from './Layout/pages-layout/pages-layout.component';
import { authGuard } from './core/guards/auth.guard';

import {
  AnalyticsComponent,
  StandardComponent,
  DropdownsComponent,
  CardsComponent,
  ListGroupsComponent,
  TimelineComponent,
  IconsComponent,
  AccordionsComponent,
  TabsComponent,
  CarouselComponent,
  ModalsComponent,
  PaginationComponent,
  ProgressBarComponent,
  TooltipsPopoversComponent,
  ControlsComponent,
  LayoutComponent,
  RegularComponent,
  TablesMainComponent,
  ChartBoxes3Component,
  ForgotPasswordBoxedComponent,
  LoginBoxedComponent,
  RegisterBoxedComponent,
  ChartjsComponent,
} from './components.barrel';

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

      // Theme Demo — ArchitectUI examples (temporary)
      {
        path: 'dashboards/analytics',
        component: AnalyticsComponent,
        data: { extraParameter: 'dashboardsMenu' },
      },
      {
        path: 'elements/buttons-standard',
        component: StandardComponent,
        data: { extraParameter: 'elementsMenu' },
      },
      {
        path: 'elements/dropdowns',
        component: DropdownsComponent,
        data: { extraParameter: 'elementsMenu' },
      },
      {
        path: 'elements/icons',
        component: IconsComponent,
        data: { extraParameter: 'elementsMenu' },
      },
      {
        path: 'elements/cards',
        component: CardsComponent,
        data: { extraParameter: 'elementsMenu' },
      },
      {
        path: 'elements/list-group',
        component: ListGroupsComponent,
        data: { extraParameter: 'elementsMenu' },
      },
      {
        path: 'elements/timeline',
        component: TimelineComponent,
        data: { extraParameter: 'elementsMenu' },
      },
      {
        path: 'components/tabs',
        component: TabsComponent,
        data: { extraParameter: 'componentsMenu' },
      },
      {
        path: 'components/accordions',
        component: AccordionsComponent,
        data: { extraParameter: 'componentsMenu' },
      },
      {
        path: 'components/carousel',
        component: CarouselComponent,
        data: { extraParameter: 'componentsMenu' },
      },
      {
        path: 'components/modals',
        component: ModalsComponent,
        data: { extraParameter: 'componentsMenu' },
      },
      {
        path: 'components/pagination',
        component: PaginationComponent,
        data: { extraParameter: 'componentsMenu' },
      },
      {
        path: 'components/progress-bar',
        component: ProgressBarComponent,
        data: { extraParameter: 'componentsMenu' },
      },
      {
        path: 'components/tooltips-popovers',
        component: TooltipsPopoversComponent,
        data: { extraParameter: 'componentsMenu' },
      },
      {
        path: 'charts/chartjs',
        component: ChartjsComponent,
        data: { extraParameter: 'chartsMenu' },
      },
      {
        path: 'forms/controls',
        component: ControlsComponent,
        data: { extraParameter: 'formsMenu' },
      },
      {
        path: 'forms/layouts',
        component: LayoutComponent,
        data: { extraParameter: 'formsMenu' },
      },
      {
        path: 'tables/regular',
        component: RegularComponent,
        data: { extraParameter: 'tablesMenu' },
      },
      {
        path: 'tables/bootstrap',
        component: TablesMainComponent,
        data: { extraParameter: 'tablesMenu' },
      },
      {
        path: 'widgets/chart-boxes-3',
        component: ChartBoxes3Component,
        data: { extraParameter: 'widgetsMenu' },
      },
    ],
  },
  {
    path: '',
    component: PagesLayoutComponent,
    children: [
      {
        path: 'pages/login-boxed',
        component: LoginBoxedComponent,
        data: { extraParameter: '' },
      },
      {
        path: 'pages/register-boxed',
        component: RegisterBoxedComponent,
        data: { extraParameter: '' },
      },
      {
        path: 'pages/forgot-password-boxed',
        component: ForgotPasswordBoxedComponent,
        data: { extraParameter: '' },
      },
    ],
  },
  {
    path: 'docs',
    loadChildren: () =>
      import('./docs/docs.module').then((m) => m.DocsModule),
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
