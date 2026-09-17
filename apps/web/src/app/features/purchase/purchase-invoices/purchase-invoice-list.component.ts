import {
  Component,
  OnInit,
  TemplateRef,
  ViewChild,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { forkJoin } from 'rxjs';
import { AppPermissions } from '../../../core/permissions/permissions.constants';
import { PermissionService } from '../../../core/permissions/permission.service';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  formatQuantity,
  isPositiveDecimal,
  subtractDecimals,
} from '../../../shared/utils/decimal.util';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import {
  GoodsReceipt,
  PurchaseInvoice,
  PurchaseOrder,
  PurchaseOrderItem,
  Supplier,
  SupplierPayment,
} from '../models/purchase.models';
import { GoodsReceiptService } from '../goods-receipts/goods-receipt.service';
import { PurchaseOrderService } from '../purchase-orders/purchase-order.service';
import { SupplierService } from '../suppliers/supplier.service';
import { PurchaseInvoiceService } from './purchase-invoice.service';
import { MasterDataOption } from '../../../shared/master-data/master-data.models';
import { MasterDataService } from '../../../shared/master-data/master-data.service';

@Component({
  selector: 'app-purchase-invoice-list',
  templateUrl: './purchase-invoice-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class PurchaseInvoiceListComponent implements OnInit {
  @ViewChild('formModal') formModal!: TemplateRef<unknown>;
  @ViewChild('detailModal') detailModal!: TemplateRef<unknown>;
  @ViewChild('paymentModal') paymentModal!: TemplateRef<unknown>;

  private readonly invoices = inject(PurchaseInvoiceService);
  private readonly orderService = inject(PurchaseOrderService);
  private readonly supplierService = inject(SupplierService);
  private readonly receiptService = inject(GoodsReceiptService);
  private readonly masterData = inject(MasterDataService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canCreate = this.permissions.has(AppPermissions.PURCHASE_INVOICES_CREATE);
  readonly canUpdate = this.permissions.has(AppPermissions.PURCHASE_INVOICES_UPDATE);
  readonly canConfirm = this.permissions.has(AppPermissions.PURCHASE_INVOICES_CONFIRM);
  readonly canCancel = this.permissions.has(AppPermissions.PURCHASE_INVOICES_CANCEL);
  readonly canRecordPayment = this.permissions.has(
    AppPermissions.PURCHASE_INVOICES_RECORD_PAYMENT,
  );

  items: PurchaseInvoice[] = [];
  orders: PurchaseOrder[] = [];
  suppliers: Supplier[] = [];
  receipts: GoodsReceipt[] = [];
  paymentMethods: MasterDataOption[] = [];
  payments: SupplierPayment[] = [];
  loading = false;
  error: string | null = null;
  filter = '';
  saving = false;
  actionId: string | null = null;
  paymentSaving = false;
  viewing: PurchaseInvoice | null = null;
  selectedOrder: PurchaseOrder | null = null;
  payingInvoice: PurchaseInvoice | null = null;
  private modalRef?: NgbModalRef;
  private paymentModalRef?: NgbModalRef;

  form = this.fb.group({
    purchaseOrderId: ['', Validators.required],
    supplierInvoiceNumber: [''],
    invoiceDate: [''],
    dueDate: [''],
    notes: [''],
    items: this.fb.array([] as FormGroup[]),
  });

  paymentForm = this.fb.group({
    amount: ['', [Validators.required, Validators.pattern(/^\d+(\.\d{1,4})?$/)]],
    paymentDate: ['', Validators.required],
    paymentMethodId: [''],
    reference: ['', Validators.maxLength(120)],
    notes: ['', Validators.maxLength(500)],
  });

  ngOnInit(): void {
    this.loadLookups();
    this.load();
  }

  get lines(): FormArray {
    return this.form.get('items') as FormArray;
  }

  /** POs that could plausibly still have unbilled received quantity. */
  get invoiceableOrders(): PurchaseOrder[] {
    return this.orders.filter(
      (o) => o.status === 'CONFIRMED' || o.status === 'PARTIALLY_RECEIVED' || o.status === 'RECEIVED',
    );
  }

  get filtered(): PurchaseInvoice[] {
    const q = this.filter.trim().toLowerCase();
    if (!q) {
      return this.items;
    }
    return this.items.filter((inv) => {
      return (
        inv.invoiceNumber.toLowerCase().includes(q) ||
        (inv.supplierInvoiceNumber ?? '').toLowerCase().includes(q) ||
        inv.status.toLowerCase().includes(q) ||
        inv.supplierName.toLowerCase().includes(q)
      );
    });
  }

  orderLabel(id: string): string {
    const o = this.orders.find((x) => x.id === id);
    if (!o) {
      return id.slice(0, 8) + '…';
    }
    return `${o.poNumber} — ${o.status}`;
  }

  /** Receipts posted against the given PO item — used to populate the optional GR-item picker. */
  receiptLinesFor(poItemId: string): Array<{ id: string; label: string }> {
    const out: Array<{ id: string; label: string }> = [];
    for (const r of this.receipts) {
      for (const line of r.items) {
        if (line.purchaseOrderItemId === poItemId) {
          out.push({
            id: line.id,
            label: `${r.id.slice(0, 8)}… (${r.status}) — qty ${formatQuantity(line.quantity)}`,
          });
        }
      }
    }
    return out;
  }

  remainingToInvoice(item: PurchaseOrderItem): string {
    return formatQuantity(
      subtractDecimals(item.receivedQuantity, item.invoicedQuantity ?? '0'),
    );
  }

  statusBadgeClass(status: string): string {
    if (status === 'CONFIRMED') return 'bg-success';
    if (status === 'CANCELLED') return 'bg-secondary';
    return 'bg-warning text-dark'; // DRAFT
  }

  paymentStatusBadgeClass(status: string): string {
    switch (status) {
      case 'PAID':
        return 'bg-success';
      case 'PARTIALLY_PAID':
        return 'bg-info text-dark';
      default:
        return 'bg-secondary';
    }
  }

  paymentMethodLabel(id: string | null): string {
    if (!id) {
      return '—';
    }
    const m = this.paymentMethods.find((x) => x.id === id);
    return m ? m.name : id.slice(0, 8);
  }

  /** Mirrors SalesInvoicesService.cancel()'s rule: a CONFIRMED invoice with any recorded payment cannot be cancelled. */
  canCancelInvoice(item: PurchaseInvoice): boolean {
    return (
      this.canCancel &&
      (item.status === 'DRAFT' || item.status === 'CONFIRMED') &&
      !isPositiveDecimal(item.amountPaid)
    );
  }

  canRecordPaymentFor(item: PurchaseInvoice): boolean {
    return (
      this.canRecordPayment &&
      item.status === 'CONFIRMED' &&
      item.paymentStatus !== 'PAID'
    );
  }

  loadLookups(): void {
    forkJoin({
      orders: this.orderService.list(),
      suppliers: this.supplierService.list(),
      receipts: this.receiptService.list(),
      paymentMethods: this.masterData.paymentMethods(),
    }).subscribe({
      next: ({ orders, suppliers, receipts, paymentMethods }) => {
        this.orders = orders.items ?? [];
        this.suppliers = suppliers.items ?? [];
        this.receipts = receipts.items ?? [];
        this.paymentMethods = (paymentMethods.items ?? []).filter((p) => p.isActive);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load invoice lookups'));
        this.cdr.detectChanges();
      },
    });
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.invoices.list().subscribe({
      next: (res) => {
        this.items = res.items ?? [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load purchase invoices');
        this.cdr.detectChanges();
      },
    });
  }

  openCreate(): void {
    if (!this.canCreate) {
      return;
    }
    this.selectedOrder = null;
    this.form.reset({
      purchaseOrderId: '',
      supplierInvoiceNumber: '',
      invoiceDate: '',
      dueDate: '',
      notes: '',
    });
    this.lines.clear();
    this.modalRef = this.modal.open(this.formModal, { centered: true, size: 'xl' });
  }

  onPurchaseOrderChange(orderId: string): void {
    const order = this.orders.find((o) => o.id === orderId) ?? null;
    this.selectedOrder = order;
    this.lines.clear();
    if (!order) {
      return;
    }
    for (const item of order.items) {
      const remaining = this.remainingToInvoice(item);
      if (!isPositiveDecimal(remaining)) {
        continue;
      }
      this.lines.push(
        this.fb.group({
          purchaseOrderItemId: [item.id, Validators.required],
          include: [true],
          goodsReceiptItemId: [''],
          quantity: [
            remaining,
            [Validators.required, Validators.pattern(/^\d+(\.\d{1,6})?$/)],
          ],
          maxRemaining: [remaining],
          unitCost: [item.unitCost, Validators.required],
          discountPercent: [item.discountPercent ?? '0'],
        }),
      );
    }
    this.cdr.detectChanges();
  }

  openDetail(invoice: PurchaseInvoice): void {
    this.viewing = invoice;
    this.payments = [];
    this.modal.open(this.detailModal, { centered: true, size: 'lg' });
    forkJoin({
      detail: this.invoices.getById(invoice.id),
      payments: this.invoices.listPayments(invoice.id),
    }).subscribe({
      next: ({ detail, payments }) => {
        this.viewing = detail;
        this.payments = payments.items ?? [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load invoice details'));
        this.cdr.detectChanges();
      },
    });
  }

  openRecordPayment(item: PurchaseInvoice): void {
    if (!this.canRecordPaymentFor(item)) {
      return;
    }
    this.payingInvoice = item;
    this.paymentForm.reset({
      amount: '',
      paymentDate: '',
      paymentMethodId: '',
      reference: '',
      notes: '',
    });
    this.cdr.detectChanges();
    this.paymentModalRef = this.modal.open(this.paymentModal, { centered: true });
  }

  /** True once the entered amount exceeds the paying invoice's balance due — blocks submit client-side. */
  get paymentExceedsBalance(): boolean {
    if (!this.payingInvoice) {
      return false;
    }
    const amount = String(this.paymentForm.get('amount')?.value ?? '').trim();
    if (!isPositiveDecimal(amount)) {
      return false;
    }
    return subtractDecimals(this.payingInvoice.balanceDue, amount, 4).startsWith('-');
  }

  submitPayment(): void {
    if (!this.payingInvoice || this.paymentForm.invalid || this.paymentSaving) {
      this.paymentForm.markAllAsTouched();
      return;
    }
    const value = this.paymentForm.getRawValue();
    const amount = String(value.amount).trim();
    if (!isPositiveDecimal(amount)) {
      this.toast.error('Payment amount must be a positive decimal.');
      return;
    }
    if (this.paymentExceedsBalance) {
      this.toast.error('Payment amount cannot exceed the balance due.');
      return;
    }
    const paymentMethodId = value.paymentMethodId?.trim() || undefined;
    const reference = value.reference?.trim() || undefined;
    const notes = value.notes?.trim() || undefined;
    const invoiceId = this.payingInvoice.id;

    this.paymentSaving = true;
    this.cdr.detectChanges();

    this.invoices
      .recordPayment(invoiceId, {
        amount,
        paymentDate: value.paymentDate!,
        paymentMethodId,
        reference,
        notes,
      })
      .subscribe({
        next: () => {
          this.paymentSaving = false;
          this.paymentModalRef?.close();
          this.payingInvoice = null;
          this.toast.success('Payment recorded');
          this.load();
          if (this.viewing?.id === invoiceId) {
            this.openDetail({ ...this.viewing });
          }
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.paymentSaving = false;
          this.toast.error(apiErrorMessage(err, 'Failed to record payment'));
          this.cdr.detectChanges();
        },
      });
  }

  confirmInvoice(invoice: PurchaseInvoice): void {
    if (!this.canConfirm || invoice.status !== 'DRAFT' || this.actionId) {
      return;
    }
    this.actionId = invoice.id;
    this.cdr.detectChanges();
    this.invoices.confirm(invoice.id).subscribe({
      next: (updated) => {
        this.actionId = null;
        this.toast.success('Purchase invoice confirmed');
        this.viewing = updated;
        this.load();
        this.orderService.list().subscribe({
          next: (res) => {
            this.orders = res.items ?? [];
            this.cdr.detectChanges();
          },
        });
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.actionId = null;
        this.toast.error(apiErrorMessage(err, 'Confirmation failed'));
        this.cdr.detectChanges();
      },
    });
  }

  cancelInvoice(invoice: PurchaseInvoice): void {
    if (!this.canCancelInvoice(invoice) || this.actionId) {
      return;
    }
    this.actionId = invoice.id;
    this.cdr.detectChanges();
    this.invoices.cancel(invoice.id).subscribe({
      next: (updated) => {
        this.actionId = null;
        this.toast.success('Purchase invoice cancelled');
        this.viewing = updated;
        this.load();
        this.orderService.list().subscribe({
          next: (res) => {
            this.orders = res.items ?? [];
            this.cdr.detectChanges();
          },
        });
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.actionId = null;
        this.toast.error(apiErrorMessage(err, 'Cancellation failed'));
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
      purchaseOrderItemId: string;
      include: boolean;
      goodsReceiptItemId: string;
      quantity: string;
      unitCost: string;
      discountPercent: string;
    }>;
    const items = raw
      .filter((line) => line.include)
      .map((line) => ({
        purchaseOrderItemId: line.purchaseOrderItemId,
        goodsReceiptItemId: line.goodsReceiptItemId || undefined,
        quantity: String(line.quantity).trim(),
        unitCost: String(line.unitCost).trim(),
        discountPercent: String(line.discountPercent || '0').trim(),
      }));

    if (items.length === 0) {
      this.toast.error('Select at least one line with a quantity to invoice.');
      return;
    }
    for (const line of items) {
      if (!isPositiveDecimal(line.quantity)) {
        this.toast.error('Invoiced quantities must be positive decimals.');
        return;
      }
    }

    const value = this.form.getRawValue();
    this.saving = true;
    this.cdr.detectChanges();

    this.invoices
      .create({
        purchaseOrderId: value.purchaseOrderId!,
        supplierInvoiceNumber: value.supplierInvoiceNumber || undefined,
        invoiceDate: value.invoiceDate || undefined,
        dueDate: value.dueDate || undefined,
        notes: value.notes || undefined,
        items,
      })
      .subscribe({
        next: () => {
          this.saving = false;
          this.modalRef?.close();
          this.toast.success('Purchase invoice created as DRAFT');
          this.load();
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          this.toast.error(apiErrorMessage(err, 'Create invoice failed'));
          this.cdr.detectChanges();
        },
      });
  }
}
