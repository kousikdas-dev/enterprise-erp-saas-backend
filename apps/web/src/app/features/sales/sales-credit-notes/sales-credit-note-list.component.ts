import {
  Component,
  OnInit,
  TemplateRef,
  ViewChild,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { AppPermissions } from '../../../core/permissions/permissions.constants';
import { PermissionService } from '../../../core/permissions/permission.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { isPositiveDecimal } from '../../../shared/utils/decimal.util';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { Customer, SalesCreditNote, SalesInvoice } from '../models/sales.models';
import { CustomerService } from '../customers/customer.service';
import { SalesInvoiceService } from '../sales-invoices/sales-invoice.service';
import { SalesCreditNoteService } from './sales-credit-note.service';

@Component({
  selector: 'app-sales-credit-note-list',
  templateUrl: './sales-credit-note-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class SalesCreditNoteListComponent implements OnInit {
  @ViewChild('formModal') formModal!: TemplateRef<unknown>;
  @ViewChild('detailModal') detailModal!: TemplateRef<unknown>;

  private readonly creditNotes = inject(SalesCreditNoteService);
  private readonly customerService = inject(CustomerService);
  private readonly invoiceService = inject(SalesInvoiceService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  /**
   * Backend gates create with sales-credit-notes.create; post + retry-posting
   * with sales-credit-notes.post; reverse + retry-reversal with
   * sales-credit-notes.reverse — mirrors Purchase Debit Note's own
   * permission split.
   */
  readonly canCreate = this.permissions.has(AppPermissions.SALES_CREDIT_NOTES_CREATE);
  readonly canPost = this.permissions.has(AppPermissions.SALES_CREDIT_NOTES_POST);
  readonly canReverse = this.permissions.has(AppPermissions.SALES_CREDIT_NOTES_REVERSE);

  items: SalesCreditNote[] = [];
  customers: Customer[] = [];
  invoices: SalesInvoice[] = [];
  loading = false;
  error: string | null = null;
  saving = false;
  actionId: string | null = null;
  viewing: SalesCreditNote | null = null;
  private modalRef?: NgbModalRef;

  // Filters (client-side — the list endpoint returns the full JWT-tenant set,
  // same as Sales Return/Sales Invoice).
  filterText = '';
  filterCustomerId = '';
  filterStatus = '';
  filterFromDate = '';
  filterToDate = '';

  form = this.fb.group({
    customerId: ['', Validators.required],
    salesInvoiceId: [''],
    creditNoteDate: [''],
    reason: [''],
    notes: [''],
    items: this.fb.array([] as FormGroup[]),
  });

  ngOnInit(): void {
    this.loadLookups();
    this.load();
  }

  get lines(): FormArray {
    return this.form.get('items') as FormArray;
  }

  get eligibleInvoicesForCustomer(): SalesInvoice[] {
    const customerId = this.form.controls.customerId.value;
    if (!customerId) return [];
    return this.invoices.filter(
      (invoice) => invoice.customerId === customerId && invoice.status === 'SENT',
    );
  }

  get filtered(): SalesCreditNote[] {
    const q = this.filterText.trim().toLowerCase();
    return this.items.filter((item) => {
      if (this.filterCustomerId && item.customerId !== this.filterCustomerId) return false;
      if (this.filterStatus && item.status !== this.filterStatus) return false;
      if (this.filterFromDate && item.creditNoteDate < this.filterFromDate) return false;
      if (this.filterToDate && item.creditNoteDate > this.filterToDate) return false;
      if (!q) return true;
      return (
        item.creditNoteNumber.toLowerCase().includes(q) ||
        item.customerName.toLowerCase().includes(q) ||
        (item.reason ?? '').toLowerCase().includes(q)
      );
    });
  }

  customerLabel(id: string): string {
    const c = this.customers.find((x) => x.id === id);
    return c ? `${c.code} — ${c.name}` : id.slice(0, 8);
  }

  invoiceLabel(id: string | null): string {
    if (!id) return '—';
    const invoice = this.invoices.find((x) => x.id === id);
    return invoice ? invoice.invoiceNumber : id.slice(0, 8) + '…';
  }

  statusBadgeClass(status: string): string {
    if (status === 'POSTED') return 'bg-success';
    if (status === 'REVERSED') return 'bg-secondary';
    return 'bg-warning text-dark'; // DRAFT
  }

  postingStatusBadgeClass(status: string): string {
    switch (status) {
      case 'POSTED':
        return 'bg-success';
      case 'FAILED':
        return 'bg-danger';
      case 'REVERSED':
        return 'bg-secondary';
      default:
        return 'bg-light text-dark border'; // NOT_POSTED
    }
  }

  loadLookups(): void {
    this.customerService.list().subscribe({
      next: (res) => {
        this.customers = res.items ?? [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load customers'));
        this.cdr.detectChanges();
      },
    });
    this.invoiceService.list().subscribe({
      next: (res) => {
        this.invoices = res.items ?? [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load sales invoices'));
        this.cdr.detectChanges();
      },
    });
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.creditNotes.list().subscribe({
      next: (res) => {
        this.items = res.items ?? [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load sales credit notes');
        this.cdr.detectChanges();
      },
    });
  }

  openCreate(): void {
    if (!this.canCreate) {
      return;
    }
    this.form.reset({
      customerId: '',
      salesInvoiceId: '',
      creditNoteDate: '',
      reason: '',
      notes: '',
    });
    this.lines.clear();
    this.addLine();
    this.modalRef = this.modal.open(this.formModal, { centered: true, size: 'lg' });
  }

  addLine(): void {
    this.lines.push(
      this.fb.group({
        description: ['', [Validators.required, Validators.maxLength(500)]],
        quantity: ['1', [Validators.required, Validators.pattern(/^\d+(\.\d{1,6})?$/)]],
        unitPrice: ['', [Validators.required, Validators.pattern(/^\d+(\.\d{1,4})?$/)]],
        discountPercent: ['0'],
      }),
    );
  }

  removeLine(index: number): void {
    this.lines.removeAt(index);
  }

  openDetail(item: SalesCreditNote): void {
    this.viewing = item;
    this.modal.open(this.detailModal, { centered: true, size: 'lg' });
    this.creditNotes.getById(item.id).subscribe({
      next: (detail) => {
        this.viewing = detail;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load sales credit note details'));
        this.cdr.detectChanges();
      },
    });
  }

  save(): void {
    if (this.form.invalid || this.saving || this.lines.length === 0) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.lines.getRawValue() as Array<{
      description: string;
      quantity: string;
      unitPrice: string;
      discountPercent: string;
    }>;
    for (const line of raw) {
      if (!isPositiveDecimal(line.quantity)) {
        this.toast.error('Line quantities must be positive decimals.');
        return;
      }
    }

    const value = this.form.getRawValue();
    this.saving = true;
    this.cdr.detectChanges();

    this.creditNotes
      .create({
        customerId: value.customerId!,
        salesInvoiceId: value.salesInvoiceId || undefined,
        creditNoteDate: value.creditNoteDate || undefined,
        reason: value.reason || undefined,
        notes: value.notes || undefined,
        items: raw.map((line) => ({
          description: line.description.trim(),
          quantity: String(line.quantity).trim(),
          unitPrice: String(line.unitPrice).trim(),
          discountPercent: line.discountPercent || undefined,
        })),
      })
      .subscribe({
        next: () => {
          this.saving = false;
          this.modalRef?.close();
          this.toast.success('Sales credit note created as DRAFT');
          this.load();
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          this.toast.error(apiErrorMessage(err, 'Create sales credit note failed'));
          this.cdr.detectChanges();
        },
      });
  }

  postCreditNote(item: SalesCreditNote): void {
    if (!this.canPost || item.status !== 'DRAFT' || this.actionId) {
      return;
    }
    this.actionId = item.id;
    this.cdr.detectChanges();
    this.creditNotes.post(item.id).subscribe({
      next: (updated) => {
        this.actionId = null;
        this.toast.success('Sales credit note posted');
        this.viewing = updated;
        this.load();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.actionId = null;
        this.toast.error(apiErrorMessage(err, 'Posting failed'));
        this.cdr.detectChanges();
      },
    });
  }

  /** Mirrors Purchase Debit Note's canRetryPosting(): a failed posting on a POSTED credit note can be retried. */
  canRetryPosting(item: SalesCreditNote): boolean {
    return this.canPost && item.status === 'POSTED' && item.accountingPostingStatus === 'FAILED';
  }

  /** Mirrors Purchase Debit Note's canReverseDebitNote(): only a POSTED credit note can be reversed. */
  canReverseCreditNote(item: SalesCreditNote): boolean {
    return this.canReverse && item.status === 'POSTED';
  }

  /**
   * A reversed credit note whose post-reversal accounting attempt failed
   * stays at accountingPostingStatus POSTED (never a new FAILED-for-reversal
   * state), so that exact combination is what's retryable here — mirrors
   * Purchase Debit Note's own canRetryReversal().
   */
  canRetryReversal(item: SalesCreditNote): boolean {
    return (
      this.canReverse && item.status === 'REVERSED' && item.accountingPostingStatus === 'POSTED'
    );
  }

  retryAccountingPosting(item: SalesCreditNote): void {
    if (!this.canRetryPosting(item) || this.actionId) {
      return;
    }
    this.actionId = item.id;
    this.cdr.detectChanges();
    this.creditNotes.retryAccountingPosting(item.id).subscribe({
      next: (updated) => {
        this.actionId = null;
        const ok = updated.accountingPostingStatus === 'POSTED';
        this.toast[ok ? 'success' : 'error'](
          ok ? 'Accounting posting succeeded' : 'Accounting posting failed again',
        );
        this.viewing = updated;
        this.load();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.actionId = null;
        this.toast.error(apiErrorMessage(err, 'Retry accounting posting failed'));
        this.cdr.detectChanges();
      },
    });
  }

  reverseCreditNote(item: SalesCreditNote): void {
    if (!this.canReverseCreditNote(item) || this.actionId) {
      return;
    }
    this.actionId = item.id;
    this.cdr.detectChanges();
    this.creditNotes.reverse(item.id).subscribe({
      next: (updated) => {
        this.actionId = null;
        this.toast.success('Sales credit note reversed');
        this.viewing = updated;
        this.load();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.actionId = null;
        this.toast.error(apiErrorMessage(err, 'Reversal failed'));
        this.cdr.detectChanges();
      },
    });
  }

  retryAccountingReversal(item: SalesCreditNote): void {
    if (!this.canRetryReversal(item) || this.actionId) {
      return;
    }
    this.actionId = item.id;
    this.cdr.detectChanges();
    this.creditNotes.retryAccountingReversal(item.id).subscribe({
      next: (updated) => {
        this.actionId = null;
        const ok = updated.accountingPostingStatus === 'REVERSED';
        this.toast[ok ? 'success' : 'error'](
          ok ? 'Accounting reversal succeeded' : 'Accounting reversal failed again',
        );
        this.viewing = updated;
        this.load();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.actionId = null;
        this.toast.error(apiErrorMessage(err, 'Retry accounting reversal failed'));
        this.cdr.detectChanges();
      },
    });
  }
}
