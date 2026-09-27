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
import { isPositiveDecimal, subtractDecimals } from '../../../shared/utils/decimal.util';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { SalesInvoice } from '../models/sales.models';
import { SalesInvoiceService } from '../sales-invoices/sales-invoice.service';
import { SalesReturn } from '../models/sales.models';
import { SalesReturnService } from './sales-return.service';

@Component({
  selector: 'app-sales-return-list',
  templateUrl: './sales-return-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class SalesReturnListComponent implements OnInit {
  @ViewChild('formModal') formModal!: TemplateRef<unknown>;
  @ViewChild('detailModal') detailModal!: TemplateRef<unknown>;

  private readonly returns = inject(SalesReturnService);
  private readonly invoiceService = inject(SalesInvoiceService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  /**
   * Backend gates create with sales-returns.create; confirm + retry-posting
   * with sales-returns.confirm; reverse + retry-reversal with
   * sales-returns.reverse — mirrors Purchase Return's permission shape
   * exactly (see PurchaseReturnListComponent).
   */
  readonly canCreate = this.permissions.has(AppPermissions.SALES_RETURNS_CREATE);
  readonly canConfirm = this.permissions.has(AppPermissions.SALES_RETURNS_CONFIRM);
  readonly canReverse = this.permissions.has(AppPermissions.SALES_RETURNS_REVERSE);

  items: SalesReturn[] = [];
  invoices: SalesInvoice[] = [];
  loading = false;
  error: string | null = null;
  filter = '';
  saving = false;
  actionId: string | null = null;
  viewing: SalesReturn | null = null;
  selectedInvoice: SalesInvoice | null = null;
  private modalRef?: NgbModalRef;

  form = this.fb.group({
    salesInvoiceId: ['', Validators.required],
    reason: [''],
    items: this.fb.array([] as FormGroup[]),
  });

  ngOnInit(): void {
    this.loadLookups();
    this.load();
  }

  get lines(): FormArray {
    return this.form.get('items') as FormArray;
  }

  /** Only SENT invoices can have a return created against them — mirrors the backend's own check. */
  get eligibleInvoices(): SalesInvoice[] {
    return this.invoices.filter((i) => i.status === 'SENT');
  }

  get filtered(): SalesReturn[] {
    const q = this.filter.trim().toLowerCase();
    if (!q) {
      return this.items;
    }
    return this.items.filter((r) => {
      return (
        r.returnNumber.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q) ||
        r.salesInvoiceId.toLowerCase().includes(q) ||
        this.invoiceLabel(r.salesInvoiceId).toLowerCase().includes(q)
      );
    });
  }

  invoiceLabel(id: string): string {
    const inv = this.invoices.find((x) => x.id === id);
    if (!inv) {
      return id.slice(0, 8) + '…';
    }
    return `${inv.invoiceNumber} — ${inv.customerName}`;
  }

  /** Client-side, non-authoritative hint only — derived from the invoice line's own server-reported returnedQuantity. */
  remainingFor(item: { quantity: string; returnedQuantity: string }): string {
    return subtractDecimals(item.quantity, item.returnedQuantity, 6);
  }

  statusBadgeClass(status: string): string {
    if (status === 'CONFIRMED') return 'bg-success';
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
    this.returns.list().subscribe({
      next: (res) => {
        this.items = res.items ?? [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load sales returns');
        this.cdr.detectChanges();
      },
    });
  }

  openCreate(): void {
    if (!this.canCreate) {
      return;
    }
    this.selectedInvoice = null;
    this.form.reset({ salesInvoiceId: '', reason: '' });
    this.lines.clear();
    this.modalRef = this.modal.open(this.formModal, { centered: true, size: 'lg' });
  }

  onSalesInvoiceChange(invoiceId: string): void {
    const invoice = this.invoices.find((i) => i.id === invoiceId) ?? null;
    this.selectedInvoice = invoice;
    this.lines.clear();
    if (!invoice) {
      this.cdr.detectChanges();
      return;
    }
    // Reload the full invoice — the list response may not carry every item detail.
    this.invoiceService.getById(invoice.id).subscribe({
      next: (detail) => {
        this.selectedInvoice = detail;
        for (const item of detail.items) {
          const remaining = this.remainingFor(item);
          if (!isPositiveDecimal(remaining)) {
            continue;
          }
          this.lines.push(
            this.fb.group({
              salesInvoiceItemId: [item.id, Validators.required],
              include: [true],
              quantity: [
                remaining,
                [Validators.required, Validators.pattern(/^\d+(\.\d{1,6})?$/)],
              ],
              maxRemaining: [remaining],
              productSku: [item.productSku],
              productName: [item.productName],
              uomCode: [item.uomCode],
            }),
          );
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load sales invoice details'));
        this.cdr.detectChanges();
      },
    });
  }

  openDetail(item: SalesReturn): void {
    this.viewing = item;
    this.modal.open(this.detailModal, { centered: true, size: 'lg' });
    this.returns.getById(item.id).subscribe({
      next: (detail) => {
        this.viewing = detail;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load sales return details'));
        this.cdr.detectChanges();
      },
    });
  }

  save(): void {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.lines.getRawValue() as Array<{
      salesInvoiceItemId: string;
      include: boolean;
      quantity: string;
      maxRemaining: string;
    }>;
    const items = raw
      .filter((line) => line.include)
      .map((line) => ({
        salesInvoiceItemId: line.salesInvoiceItemId,
        quantity: String(line.quantity).trim(),
        maxRemaining: line.maxRemaining,
      }));

    if (items.length === 0) {
      this.toast.error('Select at least one line with a quantity to return.');
      return;
    }
    for (const line of items) {
      if (!isPositiveDecimal(line.quantity)) {
        this.toast.error('Return quantities must be positive decimals.');
        return;
      }
      // Non-authoritative client-side hard block — mirrors Purchase Return's
      // own check. The backend's own capacity check is what actually
      // enforces this; this just avoids an obvious round-trip failure.
      if (Number(line.quantity) > Number(line.maxRemaining)) {
        this.toast.error(
          `Return quantity for one line exceeds the remaining returnable quantity (${line.maxRemaining}).`,
        );
        return;
      }
    }

    const value = this.form.getRawValue();
    this.saving = true;
    this.cdr.detectChanges();

    this.returns
      .create({
        salesInvoiceId: value.salesInvoiceId!,
        reason: value.reason || undefined,
        items: items.map(({ salesInvoiceItemId, quantity }) => ({ salesInvoiceItemId, quantity })),
      })
      .subscribe({
        next: () => {
          this.saving = false;
          this.modalRef?.close();
          this.toast.success('Sales return created as DRAFT');
          this.load();
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          this.toast.error(apiErrorMessage(err, 'Create sales return failed'));
          this.cdr.detectChanges();
        },
      });
  }

  confirmReturn(item: SalesReturn): void {
    if (!this.canConfirm || item.status !== 'DRAFT' || this.actionId) {
      return;
    }
    this.actionId = item.id;
    this.cdr.detectChanges();
    this.returns.confirm(item.id).subscribe({
      next: (updated) => {
        this.actionId = null;
        this.toast.success('Sales return confirmed');
        this.viewing = updated;
        this.load();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.actionId = null;
        this.toast.error(apiErrorMessage(err, 'Confirmation failed'));
        this.cdr.detectChanges();
      },
    });
  }

  /** Mirrors PurchaseReturn's canRetryPosting(): a failed posting on a CONFIRMED return can be retried. */
  canRetryPosting(item: SalesReturn): boolean {
    return (
      this.canConfirm && item.status === 'CONFIRMED' && item.accountingPostingStatus === 'FAILED'
    );
  }

  /** Mirrors PurchaseReturn's canReverseReturn(): only a CONFIRMED return can be reversed. */
  canReverseReturn(item: SalesReturn): boolean {
    return this.canReverse && item.status === 'CONFIRMED';
  }

  /**
   * A reversed return whose post-reversal accounting attempt failed stays at
   * accountingPostingStatus POSTED (never a new FAILED-for-reversal state),
   * so that exact combination is what's retryable here — mirrors
   * PurchaseReturn's canRetryReversal().
   */
  canRetryReversal(item: SalesReturn): boolean {
    return (
      this.canReverse && item.status === 'REVERSED' && item.accountingPostingStatus === 'POSTED'
    );
  }

  retryAccountingPosting(item: SalesReturn): void {
    if (!this.canRetryPosting(item) || this.actionId) {
      return;
    }
    this.actionId = item.id;
    this.cdr.detectChanges();
    this.returns.retryAccountingPosting(item.id).subscribe({
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

  reverseReturn(item: SalesReturn): void {
    if (!this.canReverseReturn(item) || this.actionId) {
      return;
    }
    this.actionId = item.id;
    this.cdr.detectChanges();
    this.returns.reverse(item.id).subscribe({
      next: (updated) => {
        this.actionId = null;
        this.toast.success('Sales return reversed');
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

  retryAccountingReversal(item: SalesReturn): void {
    if (!this.canRetryReversal(item) || this.actionId) {
      return;
    }
    this.actionId = item.id;
    this.cdr.detectChanges();
    this.returns.retryAccountingReversal(item.id).subscribe({
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
