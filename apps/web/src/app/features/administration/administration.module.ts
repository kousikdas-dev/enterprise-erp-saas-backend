import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared.module';
import { PlaceholderPageComponent } from '../../shared/placeholder-page/placeholder-page.component';

const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'users' },
  {
    path: 'users',
    component: PlaceholderPageComponent,
    data: {
      heading: 'Users',
      subheading: 'Tenant users',
      icon: 'pe-7s-user',
      phaseMessage: 'Coming in Frontend Phase 4 — user administration.',
      extraParameter: 'adminMenu',
    },
  },
  {
    path: 'roles',
    component: PlaceholderPageComponent,
    data: {
      heading: 'Roles',
      subheading: 'Tenant roles',
      icon: 'pe-7s-config',
      phaseMessage: 'Coming in Frontend Phase 4 — role administration.',
      extraParameter: 'adminMenu',
    },
  },
  {
    path: 'permissions',
    component: PlaceholderPageComponent,
    data: {
      heading: 'Permissions',
      subheading: 'Permission catalog',
      icon: 'pe-7s-key',
      phaseMessage: 'Coming in Frontend Phase 4 — permission catalog.',
      extraParameter: 'adminMenu',
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
export class AdministrationFeatureModule {}
