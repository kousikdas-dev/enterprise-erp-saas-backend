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
import { WarehouseService } from '../../inventory/warehouses/warehouse.service';
import { Warehouse } from '../../inventory/models/inventory.models';
import { ToastService } from '../../../shared/toast/toast.service';
import { isPositiveDecimal } from '../../../shared/utils/decimal.util';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { GoodsReceipt, PurchaseReturn } from '../models/purchase.models';
import { GoodsReceiptService } from '../goods-receipts/goods-receipt.service';
import { PurchaseReturnService } from './purchase-return.service';
import { remainingReturnableQuantity } from './purchase-return-quantity.util';

@Component({
  selector: 'app-purchase-return-list',
  templateUrl: './purchase-return-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class PurchaseReturnListComponent implements OnInit {
  @ViewChild('formModal') formModal!: TemplateRef<unknown>;
  @ViewChild('detailModal') detailModal!: TemplateRef<unknown>;

  private readonly returns = inject(PurchaseReturnService);
  private readonly receiptService = inject(GoodsReceiptService);
  private readonly warehouseService = inject(WarehouseService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  /**
   * Backend gates create with purchase-returns.create; confirm + retry-posting
   * with purchase-returns.confirm; reverse + retry-reversal with
   * purchase-returns.reverse (mirrors Purchase Invoice's own dedicated _CANCEL
   * permission for cancel + retry-accounting-reversal).
   */
  readonly canCreate = this.permissions.has(AppPermissions.PURCHASE_RETURNS_CREATE);
  readonly canConfirm = this.permissions.has(AppPermissions.PURCHASE_RETURNS_CONFIRM);
  readonly canReverse = this.permissions.has(AppPermissions.PURCHASE_RETURNS_REVERSE);

  items: PurchaseReturn[] = [];
  receipts: GoodsReceipt[] = [];
  warehouses: Warehouse[] = [];
  loading = false;
  error: string | null = null;
  filter = '';
  saving = false;
  actionId: string | null = null;
  viewing: PurchaseReturn | null = null;
  selectedReceipt: GoodsReceipt | null = null;
  private modalRef?: NgbModalRef;

  form = this.fb.group({
    goodsReceiptId: ['', Validators.required],
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

  /** Only receipts Purchase Return can actually be confirmed against — mirrors the backend's own check. */
  get eligibleReceipts(): GoodsReceipt[] {
    return this.receipts.filter(
      (r) => r.status === 'POSTED' && r.accountingPostingStatus === 'POSTED',
    );
  }

  get filtered(): PurchaseReturn[] {
    const q = this.filter.trim().toLowerCase();
    if (!q) {
      return this.items;
    }
    return this.items.filter((r) => {
      return (
        r.returnNumber.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q) ||
        r.goodsReceiptId.toLowerCase().includes(q) ||
        this.receiptLabel(r.goodsReceiptId).toLowerCase().includes(q)
      );
    });
  }

  warehouseLabel(id: string): string {
    const w = this.warehouses.find((x) => x.id === id);
    return w ? `${w.code} — ${w.name}` : id.slice(0, 8);
  }

  receiptLabel(id: string): string {
    const r = this.receipts.find((x) => x.id === id);
    if (!r) {
      return id.slice(0, 8) + '…';
    }
    return `${id.slice(0, 8)}… (${r.status}) — ${this.warehouseLabel(r.warehouseId)}`;
  }

  /** Client-side, non-authoritative hint only — see purchase-return-quantity.util.ts. */
  remainingFor(item: { id: string; baseQuantity: string | null }): string {
    return remainingReturnableQuantity(item, this.items);
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
    this.receiptService.list().subscribe({
      next: (res) => {
        this.receipts = res.items ?? [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load goods receipts'));
        this.cdr.detectChanges();
      },
    });
    this.warehouseService.list().subscribe({
      next: (res) => {
        this.warehouses = res.items ?? [];
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
        this.error = apiErrorMessage(err, 'Failed to load purchase returns');
        this.cdr.detectChanges();
      },
    });
  }

  openCreate(): void {
    if (!this.canCreate) {
      return;
    }
    this.selectedReceipt = null;
    this.form.reset({ goodsReceiptId: '', reason: '' });
    this.lines.clear();
    this.modalRef = this.modal.open(this.formModal, { centered: true, size: 'lg' });
  }

  onGoodsReceiptChange(receiptId: string): void {
    const receipt = this.receipts.find((r) => r.id === receiptId) ?? null;
    this.selectedReceipt = receipt;
    this.lines.clear();
    if (!receipt) {
      this.cdr.detectChanges();
      return;
    }
    // Reload the full receipt — the list response may not carry every item detail.
    this.receiptService.getById(receipt.id).subscribe({
      next: (detail) => {
        this.selectedReceipt = detail;
        for (const item of detail.items) {
          const remaining = this.remainingFor(item);
          if (!isPositiveDecimal(remaining)) {
            continue;
          }
          this.lines.push(
            this.fb.group({
              goodsReceiptItemId: [item.id, Validators.required],
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
        this.toast.error(apiErrorMessage(err, 'Failed to load goods receipt details'));
        this.cdr.detectChanges();
      },
    });
  }

  openDetail(item: PurchaseReturn): void {
    this.viewing = item;
    this.modal.open(this.detailModal, { centered: true, size: 'lg' });
    this.returns.getById(item.id).subscribe({
      next: (detail) => {
        this.viewing = detail;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load purchase return details'));
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
      goodsReceiptItemId: string;
      include: boolean;
      quantity: string;
      maxRemaining: string;
    }>;
    const items = raw
      .filter((line) => line.include)
      .map((line) => ({
        goodsReceiptItemId: line.goodsReceiptItemId,
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
      // Non-authoritative client-side hard block — mirrors the payment form's
      // paymentExceedsBalance check. The backend's own allocation check is what
      // actually enforces this; this just avoids an obvious round-trip failure.
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
        goodsReceiptId: value.goodsReceiptId!,
        reason: value.reason || undefined,
        items: items.map(({ goodsReceiptItemId, quantity }) => ({ goodsReceiptItemId, quantity })),
      })
      .subscribe({
        next: () => {
          this.saving = false;
          this.modalRef?.close();
          this.toast.success('Purchase return created as DRAFT');
          this.load();
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          this.toast.error(apiErrorMessage(err, 'Create purchase return failed'));
          this.cdr.detectChanges();
        },
      });
  }

  confirmReturn(item: PurchaseReturn): void {
    if (!this.canConfirm || item.status !== 'DRAFT' || this.actionId) {
      return;
    }
    this.actionId = item.id;
    this.cdr.detectChanges();
    this.returns.confirm(item.id).subscribe({
      next: (updated) => {
        this.actionId = null;
        this.toast.success('Purchase return confirmed');
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

  /** Mirrors PurchaseInvoice's canRetryPosting(): a failed posting on a CONFIRMED return can be retried. */
  canRetryPosting(item: PurchaseReturn): boolean {
    return (
      this.canConfirm && item.status === 'CONFIRMED' && item.accountingPostingStatus === 'FAILED'
    );
  }

  /** Mirrors PurchaseInvoice's canCancelInvoice(): only a CONFIRMED return can be reversed. */
  canReverseReturn(item: PurchaseReturn): boolean {
    return this.canReverse && item.status === 'CONFIRMED';
  }

  /**
   * A reversed return whose post-reversal accounting attempt failed stays at
   * accountingPostingStatus POSTED (never a new FAILED-for-reversal state —
   * mirrors PurchaseInvoicesService.cancel()'s own reconciliation note), so
   * that exact combination is what's retryable here — mirrors PurchaseInvoice's
   * canRetryReversal().
   */
  canRetryReversal(item: PurchaseReturn): boolean {
    return (
      this.canReverse && item.status === 'REVERSED' && item.accountingPostingStatus === 'POSTED'
    );
  }

  retryAccountingPosting(item: PurchaseReturn): void {
    if (!this.canRetryPosting(item) || this.actionId) {
      return;
    }
    this.actionId = item.id;
    this.cdr.detectChanges();
    this.returns.retryAccountingPosting(item.id).subscribe({
      next: (updated) => {
        this.actionId = null;
        // A 200 response does not itself guarantee success — the retry endpoint can
        // return a record still at FAILED. Success/failure is read from the returned
        // status field, not the HTTP status (mirrors Purchase Invoice's own retry).
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

  reverseReturn(item: PurchaseReturn): void {
    if (!this.canReverseReturn(item) || this.actionId) {
      return;
    }
    this.actionId = item.id;
    this.cdr.detectChanges();
    this.returns.reverse(item.id).subscribe({
      next: (updated) => {
        this.actionId = null;
        this.toast.success('Purchase return reversed');
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

  retryAccountingReversal(item: PurchaseReturn): void {
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
