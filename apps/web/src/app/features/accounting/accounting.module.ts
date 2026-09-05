import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared.module';
import { ListStateComponent } from '../../shared/list-state/list-state.component';
import { AccountListComponent } from './accounts/account-list.component';

const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'accounts' },
  {
    path: 'accounts',
    component: AccountListComponent,
    data: { extraParameter: 'accountingMenu' },
  },
];

@NgModule({
  declarations: [AccountListComponent],
  imports: [SharedModule, ListStateComponent, RouterModule.forChild(routes)],
})
export class AccountingFeatureModule {}
