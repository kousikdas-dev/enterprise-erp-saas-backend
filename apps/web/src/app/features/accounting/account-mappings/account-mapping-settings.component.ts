import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { forkJoin } from 'rxjs';
import { AppPermissions } from '../../../core/permissions/permissions.constants';
import { PermissionService } from '../../../core/permissions/permission.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { MasterDataOption } from '../../../shared/master-data/master-data.models';
import { MasterDataService } from '../../../shared/master-data/master-data.service';
import {
  Account,
  AccountMapping,
  AccountMappingPurpose,
} from '../models/accounting.models';
import { AccountService } from '../accounts/account.service';
import { AccountMappingService } from './account-mapping.service';

/** Tenant-wide (singleton) purposes always resolve at externalRefId = "" — one row each, no entity picker. */
const SINGLETON_PURPOSES: Array<{
  purpose: AccountMappingPurpose;
  label: string;
  hint: string;
}> = [
  {
    purpose: 'PURCHASE_EXPENSE',
    label: 'Purchase expense',
    hint: 'Debited when a purchase invoice is posted to accounting.',
  },
  {
    purpose: 'ACCOUNTS_PAYABLE',
    label: 'Accounts payable',
    hint: 'Credited when a purchase invoice is posted to accounting.',
  },
  {
    purpose: 'INPUT_TAX',
    label: 'Input tax',
    hint: 'Debited for the tax portion of a posted purchase invoice.',
  },
  {
    purpose: 'SALES_REVENUE',
    label: 'Sales revenue',
    hint: 'Credited when a sales invoice is posted to accounting.',
  },
  {
    purpose: 'ACCOUNTS_RECEIVABLE',
    label: 'Accounts receivable',
    hint: 'Debited when a sales invoice is posted to accounting.',
  },
  {
    purpose: 'OUTPUT_TAX',
    label: 'Output tax',
    hint: 'Credited for the tax portion of a posted sales invoice.',
  },
];

interface SingletonRow {
  purpose: AccountMappingPurpose;
  label: string;
  hint: string;
  mapping: AccountMapping | null;
  selectedAccountId: string;
}

interface PaymentMethodRow {
  paymentMethod: MasterDataOption;
  mapping: AccountMapping | null;
  selectedAccountId: string;
}

@Component({
  selector: 'app-account-mapping-settings',
  templateUrl: './account-mapping-settings.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class AccountMappingSettingsComponent implements OnInit {
  private readonly mappings = inject(AccountMappingService);
  private readonly accountsService = inject(AccountService);
  private readonly masterData = inject(MasterDataService);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canCreate = this.permissions.has(
    AppPermissions.ACCOUNT_MAPPINGS_CREATE,
  );
  readonly canUpdate = this.permissions.has(
    AppPermissions.ACCOUNT_MAPPINGS_UPDATE,
  );
  readonly canDelete = this.permissions.has(
    AppPermissions.ACCOUNT_MAPPINGS_DELETE,
  );

  accounts: Account[] = [];
  paymentMethods: MasterDataOption[] = [];
  singletonRows: SingletonRow[] = [];
  paymentMethodRows: PaymentMethodRow[] = [];
  loading = false;
  error: string | null = null;
  /** Row key (purpose or purpose:externalRefId) currently saving/removing — disables its own select only. */
  busyKey: string | null = null;

  ngOnInit(): void {
    this.load();
  }

  /** True once the user holds no permission that could act on any row — the whole page is read-only. */
  get readOnly(): boolean {
    return !this.canCreate && !this.canUpdate && !this.canDelete;
  }

  rowKey(purpose: AccountMappingPurpose, externalRefId: string): string {
    return `${purpose}:${externalRefId}`;
  }

  /** A row can be changed if the action it would trigger (create/update/clear) is permitted. */
  canEditRow(mapping: AccountMapping | null): boolean {
    return mapping ? this.canUpdate || this.canDelete : this.canCreate;
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();

    forkJoin({
      accounts: this.accountsService.list(),
      paymentMethods: this.masterData.paymentMethods(),
      mappings: this.mappings.list(),
    }).subscribe({
      next: ({ accounts, paymentMethods, mappings }) => {
        this.accounts = (accounts.items ?? []).filter((a) => a.isActive);
        this.paymentMethods = (paymentMethods.items ?? []).filter(
          (p) => p.isActive,
        );
        this.buildRows(mappings.items ?? []);
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load account mappings');
        this.cdr.detectChanges();
      },
    });
  }

  private buildRows(items: AccountMapping[]): void {
    this.singletonRows = SINGLETON_PURPOSES.map(({ purpose, label, hint }) => {
      const mapping =
        items.find((m) => m.purpose === purpose && m.externalRefId === '') ??
        null;
      return {
        purpose,
        label,
        hint,
        mapping,
        selectedAccountId: mapping?.accountId ?? '',
      };
    });

    this.paymentMethodRows = this.paymentMethods.map((paymentMethod) => {
      const mapping =
        items.find(
          (m) =>
            m.purpose === 'PAYMENT_METHOD' &&
            m.externalRefId === paymentMethod.id,
        ) ?? null;
      return {
        paymentMethod,
        mapping,
        selectedAccountId: mapping?.accountId ?? '',
      };
    });
  }

  accountLabel(id: string | null): string {
    if (!id) {
      return '—';
    }
    const account = this.accounts.find((a) => a.id === id);
    return account ? `${account.code} — ${account.name}` : id.slice(0, 8);
  }

  onSingletonAccountChange(row: SingletonRow, accountId: string): void {
    if (!this.canEditRow(row.mapping) || this.busyKey) {
      row.selectedAccountId = row.mapping?.accountId ?? '';
      return;
    }
    this.applyChange(
      this.rowKey(row.purpose, ''),
      row.mapping,
      accountId,
      { purpose: row.purpose, accountId },
      (updated) => {
        row.mapping = updated;
        row.selectedAccountId = updated?.accountId ?? '';
      },
    );
  }

  onPaymentMethodAccountChange(row: PaymentMethodRow, accountId: string): void {
    if (!this.canEditRow(row.mapping) || this.busyKey) {
      row.selectedAccountId = row.mapping?.accountId ?? '';
      return;
    }
    this.applyChange(
      this.rowKey('PAYMENT_METHOD', row.paymentMethod.id),
      row.mapping,
      accountId,
      {
        purpose: 'PAYMENT_METHOD',
        externalRefId: row.paymentMethod.id,
        accountId,
      },
      (updated) => {
        row.mapping = updated;
        row.selectedAccountId = updated?.accountId ?? '';
      },
    );
  }

  private applyChange(
    key: string,
    existing: AccountMapping | null,
    accountId: string,
    createBody: {
      purpose: AccountMappingPurpose;
      externalRefId?: string;
      accountId: string;
    },
    apply: (updated: AccountMapping | null) => void,
  ): void {
    if (!accountId) {
      if (!existing) {
        return;
      }
      if (!this.canDelete) {
        this.toast.error('You do not have permission to clear this mapping.');
        apply(existing);
        return;
      }
      this.busyKey = key;
      this.cdr.detectChanges();
      this.mappings.remove(existing.id).subscribe({
        next: () => {
          this.busyKey = null;
          this.toast.success('Mapping cleared');
          apply(null);
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.busyKey = null;
          this.toast.error(apiErrorMessage(err, 'Failed to clear mapping'));
          apply(existing);
          this.cdr.detectChanges();
        },
      });
      return;
    }

    if (existing) {
      if (existing.accountId === accountId) {
        return;
      }
      if (!this.canUpdate) {
        this.toast.error('You do not have permission to update this mapping.');
        apply(existing);
        return;
      }
      this.busyKey = key;
      this.cdr.detectChanges();
      this.mappings.update(existing.id, { accountId }).subscribe({
        next: (updated) => {
          this.busyKey = null;
          this.toast.success('Mapping updated');
          apply(updated);
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.busyKey = null;
          this.toast.error(apiErrorMessage(err, 'Failed to update mapping'));
          apply(existing);
          this.cdr.detectChanges();
        },
      });
      return;
    }

    if (!this.canCreate) {
      this.toast.error('You do not have permission to create this mapping.');
      apply(null);
      return;
    }
    this.busyKey = key;
    this.cdr.detectChanges();
    this.mappings.create(createBody).subscribe({
      next: (created) => {
        this.busyKey = null;
        this.toast.success('Mapping created');
        apply(created);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.busyKey = null;
        this.toast.error(apiErrorMessage(err, 'Failed to create mapping'));
        apply(null);
        this.cdr.detectChanges();
      },
    });
  }
}
