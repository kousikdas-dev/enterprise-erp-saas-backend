import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared.module';
import { AppsHomeComponent } from './apps-home/apps-home.component';

const routes: Routes = [
  {
    path: '',
    component: AppsHomeComponent,
    data: {
      heading: 'Dashboard',
      subheading: 'ERP overview',
      extraParameter: 'dashboardMenu',
      darkTheme: true,
    },
  },
];

@NgModule({
  imports: [SharedModule, AppsHomeComponent, RouterModule.forChild(routes)],
})
export class DashboardFeatureModule {}
