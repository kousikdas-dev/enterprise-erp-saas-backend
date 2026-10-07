import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { AppPermissions } from '../../../core/permissions/permissions.constants';
import { PermissionService } from '../../../core/permissions/permission.service';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { AccountMappingPurpose } from '../models/accounting.models';
import { AccountService } from '../accounts/account.service';
import { TaxCodeService } from '../tax-codes/tax-code.service';
import { JournalEntryService } from '../journal-entries/journal-entry.service';
import { AccountMappingService } from '../account-mappings/account-mapping.service';

/** Tenant-wide mapping purposes — mirrors SINGLETON_PURPOSES in account-mapping-settings.component.ts (PAYMENT_METHOD is per-payment-method, not counted here). */
const CORE_MAPPING_PURPOSES: readonly AccountMappingPurpose[] = [
  'PURCHASE_EXPENSE',
  'ACCOUNTS_PAYABLE',
  'INPUT_TAX',
  'SALES_REVENUE',
  'ACCOUNTS_RECEIVABLE',
  'OUTPUT_TAX',
  'SALES_DISCOUNT',
];

@Component({
  selector: 'app-accounting-overview',
  templateUrl: './accounting-overview.component.html',
  styleUrls: ['./accounting-overview.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class AccountingOverviewComponent implements OnInit {
  private readonly accountService = inject(AccountService);
  private readonly taxCodeService = inject(TaxCodeService);
  private readonly journalEntryService = inject(JournalEntryService);
  private readonly accountMappingService = inject(AccountMappingService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canReadAccounts = this.permissions.has(AppPermissions.ACCOUNTS_READ);
  readonly canReadTaxCodes = this.permissions.has(AppPermissions.TAX_CODES_READ);
  readonly canReadJournalEntries = this.permissions.has(
    AppPermissions.JOURNAL_ENTRIES_READ,
  );
  readonly canReadAccountMappings = this.permissions.has(
    AppPermissions.ACCOUNT_MAPPINGS_READ,
  );

  loading = false;
  error: string | null = null;

  accountsCount = 0;
  activeTaxCodesCount = 0;
  draftJournalEntriesCount = 0;
  unmappedCoreAccountsCount = 0;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();

    forkJoin({
      accounts: this.canReadAccounts ? this.accountService.list() : of({ items: [] }),
      taxCodes: this.canReadTaxCodes ? this.taxCodeService.list() : of({ items: [] }),
      journalEntries: this.canReadJournalEntries
        ? this.journalEntryService.list()
        : of({ items: [] }),
      accountMappings: this.canReadAccountMappings
        ? this.accountMappingService.list()
        : of({ items: [] }),
    }).subscribe({
      next: ({ accounts, taxCodes, journalEntries, accountMappings }) => {
        this.accountsCount = accounts.items.length;
        this.activeTaxCodesCount = taxCodes.items.filter((t) => t.isActive).length;
        this.draftJournalEntriesCount = journalEntries.items.filter(
          (e) => e.status === 'DRAFT',
        ).length;
        this.unmappedCoreAccountsCount = CORE_MAPPING_PURPOSES.filter(
          (purpose) =>
            !accountMappings.items.some(
              (m) => m.purpose === purpose && m.externalRefId === '',
            ),
        ).length;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load accounting overview');
        this.cdr.detectChanges();
      },
    });
  }
}
