import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { AppPermissions } from '../../../core/permissions/permissions.constants';
import { PermissionService } from '../../../core/permissions/permission.service';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { ProfitLossResponse } from '../models/accounting.models';
import { ReportsService } from './reports.service';

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstDayOfMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

@Component({
  selector: 'app-profit-loss',
  templateUrl: './profit-loss.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class ProfitLossComponent implements OnInit {
  private readonly reports = inject(ReportsService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canView = this.permissions.has(AppPermissions.PROFIT_LOSS_READ);

  fromDate = firstDayOfMonth();
  toDate = todayDateOnly();

  loading = false;
  error: string | null = null;
  result: ProfitLossResponse | null = null;

  ngOnInit(): void {
    this.load();
  }

  applyFilters(): void {
    this.load();
  }

  load(): void {
    if (!this.fromDate || !this.toDate) {
      return;
    }
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.reports.getProfitLoss({ fromDate: this.fromDate, toDate: this.toDate }).subscribe({
      next: (res) => {
        this.result = res;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load the Profit & Loss report');
        this.cdr.detectChanges();
      },
    });
  }
}
