import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared.module';
import { PlaceholderPageComponent } from '../../shared/placeholder-page/placeholder-page.component';

const routes: Routes = [
  {
    path: '',
    component: PlaceholderPageComponent,
    data: {
      heading: 'Dashboard',
      subheading: 'ERP overview',
      icon: 'pe-7s-rocket',
      phaseMessage: 'Coming in Frontend Phase 2 — operational KPIs and widgets.',
      extraParameter: 'dashboardMenu',
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
export class DashboardFeatureModule {}
