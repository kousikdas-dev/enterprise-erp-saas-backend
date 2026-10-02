import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { AppPermissions } from '../../../core/permissions/permissions.constants';
import { PermissionService } from '../../../core/permissions/permission.service';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { BalanceSheetResponse } from '../models/accounting.models';
import { ReportsService } from './reports.service';

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

@Component({
  selector: 'app-balance-sheet',
  templateUrl: './balance-sheet.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class BalanceSheetComponent implements OnInit {
  private readonly reports = inject(ReportsService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canView = this.permissions.has(AppPermissions.BALANCE_SHEET_READ);

  asOfDate = todayDateOnly();

  loading = false;
  error: string | null = null;
  result: BalanceSheetResponse | null = null;

  ngOnInit(): void {
    this.load();
  }

  applyFilters(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.reports.getBalanceSheet({ asOfDate: this.asOfDate || undefined }).subscribe({
      next: (res) => {
        this.result = res;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load the Balance Sheet');
        this.cdr.detectChanges();
      },
    });
  }
}
