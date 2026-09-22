import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AppPermissions } from '../../../core/permissions/permissions.constants';
import { PermissionService } from '../../../core/permissions/permission.service';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { AccountLedgerResponse } from '../models/accounting.models';
import { AccountLedgerService } from './account-ledger.service';

const DEFAULT_LIMIT = 50;

@Component({
  selector: 'app-account-ledger',
  templateUrl: './account-ledger.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class AccountLedgerComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly ledgerService = inject(AccountLedgerService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canView = this.permissions.has(AppPermissions.ACCOUNT_LEDGER_READ);

  accountId = '';
  fromDate = '';
  toDate = '';
  page = 1;
  readonly limit = DEFAULT_LIMIT;

  loading = false;
  error: string | null = null;
  result: AccountLedgerResponse | null = null;

  ngOnInit(): void {
    this.accountId = this.route.snapshot.paramMap.get('id') ?? '';
    this.load();
  }

  get hasNextPage(): boolean {
    if (!this.result) {
      return false;
    }
    return this.page * this.limit < this.result.total;
  }

  get hasPrevPage(): boolean {
    return this.page > 1;
  }

  applyFilters(): void {
    this.page = 1;
    this.load();
  }

  nextPage(): void {
    if (!this.hasNextPage) {
      return;
    }
    this.page += 1;
    this.load();
  }

  prevPage(): void {
    if (!this.hasPrevPage) {
      return;
    }
    this.page -= 1;
    this.load();
  }

  load(): void {
    if (!this.accountId) {
      return;
    }
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.ledgerService
      .get(this.accountId, {
        fromDate: this.fromDate || undefined,
        toDate: this.toDate || undefined,
        page: this.page,
        limit: this.limit,
      })
      .subscribe({
        next: (res) => {
          this.result = res;
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.loading = false;
          this.error = apiErrorMessage(err, 'Failed to load account ledger');
          this.cdr.detectChanges();
        },
      });
  }
}
