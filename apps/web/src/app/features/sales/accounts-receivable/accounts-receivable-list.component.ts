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
  ArAgingResult,
  ArReconciliationSummary,
  CustomerArLedgerItem,
  CustomerArStatement,
  CustomerArSummary,
} from '../models/sales.models';
import { AccountsReceivableService } from './accounts-receivable.service';

type ArTab = 'customers' | 'invoices' | 'aging' | 'reconciliation';

@Component({
  selector: 'app-accounts-receivable-list',
  templateUrl: './accounts-receivable-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class AccountsReceivableListComponent implements OnInit {
  @ViewChild('statementModal') statementModal!: TemplateRef<unknown>;

  private readonly ar = inject(AccountsReceivableService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly permissions = inject(PermissionService);
  private readonly modal = inject(NgbModal);

  readonly canRead = this.permissions.has(AppPermissions.ACCOUNTS_RECEIVABLE_READ);

  activeTab: ArTab = 'customers';

  // Customers tab
  customers: CustomerArSummary[] = [];
  onlyOutstanding = true;
  customersLoading = false;
  customersError: string | null = null;

  // Invoices tab
  invoices: CustomerArLedgerItem[] = [];
  invoicesLoading = false;
  invoicesError: string | null = null;
  invoicesLoaded = false;
  invoicePaymentStatusFilter = '';

  // Aging tab
  aging: ArAgingResult | null = null;
  agingLoading = false;
  agingError: string | null = null;
  agingAsOfDate = '';

  // Reconciliation tab
  reconciliation: ArReconciliationSummary | null = null;
  reconciliationLoading = false;
  reconciliationError: string | null = null;

  // Customer statement modal
  statement: CustomerArStatement | null = null;
  statementLoading = false;
  statementError: string | null = null;
  statementCustomerName = '';
  statementFromDate = '';
  statementToDate = '';
  private statementCustomerId = '';

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
    this.loadCustomers();
  }

  selectTab(tab: ArTab): void {
    this.activeTab = tab;
    if (tab === 'invoices' && !this.invoicesLoaded && !this.invoicesLoading) {
      this.loadInvoices();
    } else if (tab === 'aging' && !this.aging && !this.agingLoading) {
      this.loadAging();
    } else if (tab === 'reconciliation' && !this.reconciliation && !this.reconciliationLoading) {
      this.loadReconciliation();
    }
  }

  loadCustomers(): void {
    this.customersLoading = true;
    this.customersError = null;
    this.cdr.detectChanges();
    this.ar.listCustomers(this.onlyOutstanding).subscribe({
      next: (res) => {
        this.customers = res.items ?? [];
        this.customersLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.customersLoading = false;
        this.customersError = apiErrorMessage(err, 'Failed to load customer AR summaries');
        this.cdr.detectChanges();
      },
    });
  }

  loadInvoices(): void {
    this.invoicesLoading = true;
    this.invoicesError = null;
    this.cdr.detectChanges();
    this.ar
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
          this.invoicesError = apiErrorMessage(err, 'Failed to load AR invoice ledger');
          this.cdr.detectChanges();
        },
      });
  }

  loadAging(): void {
    this.agingLoading = true;
    this.agingError = null;
    this.cdr.detectChanges();
    this.ar.getAging({ asOfDate: this.agingAsOfDate || undefined }).subscribe({
      next: (res) => {
        this.aging = res;
        this.agingLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.agingLoading = false;
        this.agingError = apiErrorMessage(err, 'Failed to load AR aging report');
        this.cdr.detectChanges();
      },
    });
  }

  loadReconciliation(): void {
    this.reconciliationLoading = true;
    this.reconciliationError = null;
    this.cdr.detectChanges();
    this.ar.getReconciliation().subscribe({
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

  openStatement(customer: CustomerArSummary): void {
    this.statementCustomerId = customer.customerId;
    this.statementCustomerName = customer.customerName;
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
    this.ar
      .getStatement(this.statementCustomerId, {
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
          this.statementError = apiErrorMessage(err, 'Failed to load customer statement');
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
    return type === 'INVOICE' ? 'bg-primary' : 'bg-success'; // PAYMENT
  }
}
