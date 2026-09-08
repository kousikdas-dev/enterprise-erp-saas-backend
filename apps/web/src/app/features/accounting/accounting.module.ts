import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared.module';
import { ListStateComponent } from '../../shared/list-state/list-state.component';
import { AccountListComponent } from './accounts/account-list.component';
import { JournalEntryListComponent } from './journal-entries/journal-entry-list.component';
import { TaxCodeListComponent } from './tax-codes/tax-code-list.component';

const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'accounts' },
  {
    path: 'accounts',
    component: AccountListComponent,
    data: { extraParameter: 'accountingMenu' },
  },
  {
    path: 'journal-entries',
    component: JournalEntryListComponent,
    data: { extraParameter: 'accountingMenu' },
  },
  {
    path: 'tax-codes',
    component: TaxCodeListComponent,
    data: { extraParameter: 'accountingMenu' },
  },
];

@NgModule({
  declarations: [AccountListComponent, JournalEntryListComponent, TaxCodeListComponent],
  imports: [SharedModule, ListStateComponent, RouterModule.forChild(routes)],
})
export class AccountingFeatureModule {}
