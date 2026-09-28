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
import { PurchaseDebitNote, PurchaseInvoice, Supplier } from '../models/purchase.models';
import { SupplierService } from '../suppliers/supplier.service';
import { PurchaseInvoiceService } from '../purchase-invoices/purchase-invoice.service';
import { PurchaseDebitNoteService } from './purchase-debit-note.service';

@Component({
  selector: 'app-purchase-debit-note-list',
  templateUrl: './purchase-debit-note-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class PurchaseDebitNoteListComponent implements OnInit {
  @ViewChild('formModal') formModal!: TemplateRef<unknown>;
  @ViewChild('detailModal') detailModal!: TemplateRef<unknown>;

  private readonly debitNotes = inject(PurchaseDebitNoteService);
  private readonly supplierService = inject(SupplierService);
  private readonly invoiceService = inject(PurchaseInvoiceService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  /**
   * Backend gates create with purchase-debit-notes.create; post + retry-posting
   * with purchase-debit-notes.post; reverse + retry-reversal with
   * purchase-debit-notes.reverse — mirrors Purchase Return's own permission split.
   */
  readonly canCreate = this.permissions.has(AppPermissions.PURCHASE_DEBIT_NOTES_CREATE);
  readonly canPost = this.permissions.has(AppPermissions.PURCHASE_DEBIT_NOTES_POST);
  readonly canReverse = this.permissions.has(AppPermissions.PURCHASE_DEBIT_NOTES_REVERSE);

  items: PurchaseDebitNote[] = [];
  suppliers: Supplier[] = [];
  invoices: PurchaseInvoice[] = [];
  loading = false;
  error: string | null = null;
  saving = false;
  actionId: string | null = null;
  viewing: PurchaseDebitNote | null = null;
  private modalRef?: NgbModalRef;

  // Filters (client-side — the list endpoint returns the full JWT-tenant set,
  // same as Purchase Return/Purchase Invoice).
  filterText = '';
  filterSupplierId = '';
  filterStatus = '';
  filterFromDate = '';
  filterToDate = '';

  form = this.fb.group({
    supplierId: ['', Validators.required],
    purchaseInvoiceId: [''],
    debitNoteDate: [''],
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

  get eligibleInvoicesForSupplier(): PurchaseInvoice[] {
    const supplierId = this.form.controls.supplierId.value;
    if (!supplierId) return [];
    return this.invoices.filter(
      (invoice) => invoice.supplierId === supplierId && invoice.status === 'CONFIRMED',
    );
  }

  get filtered(): PurchaseDebitNote[] {
    const q = this.filterText.trim().toLowerCase();
    return this.items.filter((item) => {
      if (this.filterSupplierId && item.supplierId !== this.filterSupplierId) return false;
      if (this.filterStatus && item.status !== this.filterStatus) return false;
      if (this.filterFromDate && item.debitNoteDate < this.filterFromDate) return false;
      if (this.filterToDate && item.debitNoteDate > this.filterToDate) return false;
      if (!q) return true;
      return (
        item.debitNoteNumber.toLowerCase().includes(q) ||
        item.supplierName.toLowerCase().includes(q) ||
        (item.reason ?? '').toLowerCase().includes(q)
      );
    });
  }

  supplierLabel(id: string): string {
    const s = this.suppliers.find((x) => x.id === id);
    return s ? `${s.code} — ${s.name}` : id.slice(0, 8);
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
    this.supplierService.list().subscribe({
      next: (res) => {
        this.suppliers = res.items ?? [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load suppliers'));
        this.cdr.detectChanges();
      },
    });
    this.invoiceService.list().subscribe({
      next: (res) => {
        this.invoices = res.items ?? [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load purchase invoices'));
        this.cdr.detectChanges();
      },
    });
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.debitNotes.list().subscribe({
      next: (res) => {
        this.items = res.items ?? [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load purchase debit notes');
        this.cdr.detectChanges();
      },
    });
  }

  openCreate(): void {
    if (!this.canCreate) {
      return;
    }
    this.form.reset({
      supplierId: '',
      purchaseInvoiceId: '',
      debitNoteDate: '',
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
        unitCost: ['', [Validators.required, Validators.pattern(/^\d+(\.\d{1,4})?$/)]],
        discountPercent: ['0'],
      }),
    );
  }

  removeLine(index: number): void {
    this.lines.removeAt(index);
  }

  openDetail(item: PurchaseDebitNote): void {
    this.viewing = item;
    this.modal.open(this.detailModal, { centered: true, size: 'lg' });
    this.debitNotes.getById(item.id).subscribe({
      next: (detail) => {
        this.viewing = detail;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load purchase debit note details'));
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
      unitCost: string;
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

    this.debitNotes
      .create({
        supplierId: value.supplierId!,
        purchaseInvoiceId: value.purchaseInvoiceId || undefined,
        debitNoteDate: value.debitNoteDate || undefined,
        reason: value.reason || undefined,
        notes: value.notes || undefined,
        items: raw.map((line) => ({
          description: line.description.trim(),
          quantity: String(line.quantity).trim(),
          unitCost: String(line.unitCost).trim(),
          discountPercent: line.discountPercent || undefined,
        })),
      })
      .subscribe({
        next: () => {
          this.saving = false;
          this.modalRef?.close();
          this.toast.success('Purchase debit note created as DRAFT');
          this.load();
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          this.toast.error(apiErrorMessage(err, 'Create purchase debit note failed'));
          this.cdr.detectChanges();
        },
      });
  }

  postDebitNote(item: PurchaseDebitNote): void {
    if (!this.canPost || item.status !== 'DRAFT' || this.actionId) {
      return;
    }
    this.actionId = item.id;
    this.cdr.detectChanges();
    this.debitNotes.post(item.id).subscribe({
      next: (updated) => {
        this.actionId = null;
        this.toast.success('Purchase debit note posted');
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

  /** Mirrors Purchase Return's canRetryPosting(): a failed posting on a POSTED debit note can be retried. */
  canRetryPosting(item: PurchaseDebitNote): boolean {
    return this.canPost && item.status === 'POSTED' && item.accountingPostingStatus === 'FAILED';
  }

  /** Mirrors Purchase Return's canReverseReturn(): only a POSTED debit note can be reversed. */
  canReverseDebitNote(item: PurchaseDebitNote): boolean {
    return this.canReverse && item.status === 'POSTED';
  }

  /**
   * A reversed debit note whose post-reversal accounting attempt failed stays
   * at accountingPostingStatus POSTED (never a new FAILED-for-reversal state),
   * so that exact combination is what's retryable here — mirrors Purchase
   * Return's own canRetryReversal().
   */
  canRetryReversal(item: PurchaseDebitNote): boolean {
    return (
      this.canReverse && item.status === 'REVERSED' && item.accountingPostingStatus === 'POSTED'
    );
  }

  retryAccountingPosting(item: PurchaseDebitNote): void {
    if (!this.canRetryPosting(item) || this.actionId) {
      return;
    }
    this.actionId = item.id;
    this.cdr.detectChanges();
    this.debitNotes.retryAccountingPosting(item.id).subscribe({
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

  reverseDebitNote(item: PurchaseDebitNote): void {
    if (!this.canReverseDebitNote(item) || this.actionId) {
      return;
    }
    this.actionId = item.id;
    this.cdr.detectChanges();
    this.debitNotes.reverse(item.id).subscribe({
      next: (updated) => {
        this.actionId = null;
        this.toast.success('Purchase debit note reversed');
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

  retryAccountingReversal(item: PurchaseDebitNote): void {
    if (!this.canRetryReversal(item) || this.actionId) {
      return;
    }
    this.actionId = item.id;
    this.cdr.detectChanges();
    this.debitNotes.retryAccountingReversal(item.id).subscribe({
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
