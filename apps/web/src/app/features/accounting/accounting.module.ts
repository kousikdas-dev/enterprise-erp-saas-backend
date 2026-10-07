import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared.module';
import { ListStateComponent } from '../../shared/list-state/list-state.component';
import { AccountMappingSettingsComponent } from './account-mappings/account-mapping-settings.component';
import { AccountLedgerComponent } from './accounts/account-ledger.component';
import { AccountListComponent } from './accounts/account-list.component';
import { JournalEntryListComponent } from './journal-entries/journal-entry-list.component';
import { BalanceSheetComponent } from './reports/balance-sheet.component';
import { ProfitLossComponent } from './reports/profit-loss.component';
import { TrialBalanceComponent } from './reports/trial-balance.component';
import { TaxCodeListComponent } from './tax-codes/tax-code-list.component';
import { AccountingSettingsComponent } from './settings/accounting-settings.component';
import { AccountingOverviewComponent } from './overview/accounting-overview.component';

const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'overview' },
  {
    path: 'overview',
    component: AccountingOverviewComponent,
    data: { extraParameter: 'accountingMenu', darkTheme: true },
  },
  {
    path: 'settings',
    component: AccountingSettingsComponent,
    data: { extraParameter: 'accountingMenu', darkTheme: true },
  },
  {
    path: 'accounts',
    component: AccountListComponent,
    data: { extraParameter: 'accountingMenu', darkTheme: true },
  },
  {
    path: 'accounts/:id/ledger',
    component: AccountLedgerComponent,
    data: { extraParameter: 'accountingMenu', darkTheme: true },
  },
  {
    path: 'journal-entries',
    component: JournalEntryListComponent,
    data: { extraParameter: 'accountingMenu', darkTheme: true },
  },
  {
    path: 'tax-codes',
    component: TaxCodeListComponent,
    data: { extraParameter: 'accountingMenu', darkTheme: true },
  },
  {
    path: 'account-mappings',
    component: AccountMappingSettingsComponent,
    data: { extraParameter: 'accountingMenu', darkTheme: true },
  },
  {
    path: 'reports/trial-balance',
    component: TrialBalanceComponent,
    data: { extraParameter: 'accountingMenu', darkTheme: true },
  },
  {
    path: 'reports/profit-loss',
    component: ProfitLossComponent,
    data: { extraParameter: 'accountingMenu', darkTheme: true },
  },
  {
    path: 'reports/balance-sheet',
    component: BalanceSheetComponent,
    data: { extraParameter: 'accountingMenu', darkTheme: true },
  },
];

@NgModule({
  declarations: [
    AccountingOverviewComponent,
    AccountListComponent,
    AccountLedgerComponent,
    JournalEntryListComponent,
    TaxCodeListComponent,
    AccountMappingSettingsComponent,
    TrialBalanceComponent,
    ProfitLossComponent,
    BalanceSheetComponent,
    AccountingSettingsComponent,
  ],
  imports: [SharedModule, ListStateComponent, RouterModule.forChild(routes)],
})
export class AccountingFeatureModule {}
