import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  TemplateRef,
  ViewChild,
  inject,
} from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { AppPermissions } from '../../../core/permissions/permissions.constants';
import { PermissionService } from '../../../core/permissions/permission.service';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import {
  ApAgingResult,
  ApReconciliationSummary,
  SupplierApLedgerItem,
  SupplierApStatement,
  SupplierApSummary,
} from '../models/purchase.models';
import { AccountsPayableService } from './accounts-payable.service';

type ApTab = 'suppliers' | 'invoices' | 'aging' | 'reconciliation';

@Component({
  selector: 'app-accounts-payable-list',
  templateUrl: './accounts-payable-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class AccountsPayableListComponent implements OnInit {
  @ViewChild('statementModal') statementModal!: TemplateRef<unknown>;

  private readonly ap = inject(AccountsPayableService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly permissions = inject(PermissionService);
  private readonly modal = inject(NgbModal);

  readonly canRead = this.permissions.has(AppPermissions.ACCOUNTS_PAYABLE_READ);

  activeTab: ApTab = 'suppliers';

  // Suppliers tab
  suppliers: SupplierApSummary[] = [];
  onlyOutstanding = true;
  suppliersLoading = false;
  suppliersError: string | null = null;

  // Invoices tab
  invoices: SupplierApLedgerItem[] = [];
  invoicesLoading = false;
  invoicesError: string | null = null;
  invoicesLoaded = false;
  invoicePaymentStatusFilter = '';

  // Aging tab
  aging: ApAgingResult | null = null;
  agingLoading = false;
  agingError: string | null = null;
  agingAsOfDate = '';

  // Reconciliation tab
  reconciliation: ApReconciliationSummary | null = null;
  reconciliationLoading = false;
  reconciliationError: string | null = null;

  // Supplier statement modal
  statement: SupplierApStatement | null = null;
  statementLoading = false;
  statementError: string | null = null;
  statementSupplierName = '';
  statementFromDate = '';
  statementToDate = '';
  private statementSupplierId = '';

  readonly agingBucketOrder: Array<{ key: string; label: string }> = [
    { key: 'CURRENT', label: 'Current' },
    { key: 'DAYS_1_30', label: '1-30 days' },
    { key: 'DAYS_31_60', label: '31-60 days' },
    { key: 'DAYS_61_90', label: '61-90 days' },
    { key: 'DAYS_90_PLUS', label: '90+ days' },
  ];

  ngOnInit(): void {
    if (!this.canRead) {
      return;
    }
    this.loadSuppliers();
  }

  selectTab(tab: ApTab): void {
    this.activeTab = tab;
    if (tab === 'invoices' && !this.invoicesLoaded && !this.invoicesLoading) {
      this.loadInvoices();
    } else if (tab === 'aging' && !this.aging && !this.agingLoading) {
      this.loadAging();
    } else if (tab === 'reconciliation' && !this.reconciliation && !this.reconciliationLoading) {
      this.loadReconciliation();
    }
  }

  loadSuppliers(): void {
    this.suppliersLoading = true;
    this.suppliersError = null;
    this.cdr.detectChanges();
    this.ap.listSuppliers(this.onlyOutstanding).subscribe({
      next: (res) => {
        this.suppliers = res.items ?? [];
        this.suppliersLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.suppliersLoading = false;
        this.suppliersError = apiErrorMessage(err, 'Failed to load supplier AP summaries');
        this.cdr.detectChanges();
      },
    });
  }

  loadInvoices(): void {
    this.invoicesLoading = true;
    this.invoicesError = null;
    this.cdr.detectChanges();
    this.ap
      .listInvoices({
        paymentStatus: this.invoicePaymentStatusFilter || undefined,
        includePayments: false,
      })
      .subscribe({
        next: (res) => {
          this.invoices = res.items ?? [];
          this.invoicesLoading = false;
          this.invoicesLoaded = true;
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.invoicesLoading = false;
          this.invoicesError = apiErrorMessage(err, 'Failed to load AP invoice ledger');
          this.cdr.detectChanges();
        },
      });
  }

  loadAging(): void {
    this.agingLoading = true;
    this.agingError = null;
    this.cdr.detectChanges();
    this.ap.getAging({ asOfDate: this.agingAsOfDate || undefined }).subscribe({
      next: (res) => {
        this.aging = res;
        this.agingLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.agingLoading = false;
        this.agingError = apiErrorMessage(err, 'Failed to load AP aging report');
        this.cdr.detectChanges();
      },
    });
  }

  loadReconciliation(): void {
    this.reconciliationLoading = true;
    this.reconciliationError = null;
    this.cdr.detectChanges();
    this.ap.getReconciliation().subscribe({
      next: (res) => {
        this.reconciliation = res;
        this.reconciliationLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.reconciliationLoading = false;
        this.reconciliationError = apiErrorMessage(err, 'Failed to load GL reconciliation');
        this.cdr.detectChanges();
      },
    });
  }

  openStatement(supplier: SupplierApSummary): void {
    this.statementSupplierId = supplier.supplierId;
    this.statementSupplierName = supplier.supplierName;
    this.statementFromDate = '';
    this.statementToDate = '';
    this.statement = null;
    this.statementError = null;
    this.modal.open(this.statementModal, { centered: true, size: 'lg' });
    this.loadStatement();
  }

  loadStatement(): void {
    this.statementLoading = true;
    this.statementError = null;
    this.cdr.detectChanges();
    this.ap
      .getStatement(this.statementSupplierId, {
        fromDate: this.statementFromDate || undefined,
        toDate: this.statementToDate || undefined,
      })
      .subscribe({
        next: (res) => {
          this.statement = res;
          this.statementLoading = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.statementLoading = false;
          this.statementError = apiErrorMessage(err, 'Failed to load supplier statement');
          this.cdr.detectChanges();
        },
      });
  }

  agingBasisLabel(basis: string): string {
    switch (basis) {
      case 'DUE_DATE':
        return 'Due date';
      case 'PAYMENT_TERM_DERIVED':
        return 'Payment term';
      default:
        return 'Invoice date (no due date set)';
    }
  }

  statementLineBadgeClass(type: string): string {
    if (type === 'INVOICE') return 'bg-primary';
    if (type === 'PAYMENT_REVERSAL') return 'bg-warning text-dark';
    return 'bg-success'; // PAYMENT
  }
}
