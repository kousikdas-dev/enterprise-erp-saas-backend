import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared.module';
import { PlaceholderPageComponent } from '../../shared/placeholder-page/placeholder-page.component';

const routes: Routes = [
  {
    path: '',
    component: PlaceholderPageComponent,
    data: {
      heading: 'Audit Logs',
      subheading: 'Security and business audit trail',
      icon: 'pe-7s-next-2',
      phaseMessage:
        'Coming later — no public Gateway audit-read API exists yet. This page is a UI placeholder only.',
      extraParameter: 'auditMenu',
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
export class AuditFeatureModule {}
