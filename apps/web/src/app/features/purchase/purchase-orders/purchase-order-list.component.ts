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
import { ProductService } from '../../inventory/products/product.service';
import { Product } from '../../inventory/models/inventory.models';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  isPositiveDecimal,
  multiplyDecimals,
  subtractDecimals,
  formatQuantity,
} from '../../../shared/utils/decimal.util';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { PurchaseOrder, Supplier } from '../models/purchase.models';
import { SupplierService } from '../suppliers/supplier.service';
import { PurchaseOrderService } from './purchase-order.service';

@Component({
  selector: 'app-purchase-order-list',
  templateUrl: './purchase-order-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class PurchaseOrderListComponent implements OnInit {
  @ViewChild('formModal') formModal!: TemplateRef<unknown>;
  @ViewChild('detailModal') detailModal!: TemplateRef<unknown>;
  @ViewChild('confirmModal') confirmModal!: TemplateRef<unknown>;

  private readonly orders = inject(PurchaseOrderService);
  private readonly supplierService = inject(SupplierService);
  private readonly productService = inject(ProductService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canCreate = this.permissions.has(AppPermissions.PURCHASE_ORDERS_CREATE);
  readonly canUpdate = this.permissions.has(AppPermissions.PURCHASE_ORDERS_UPDATE);
  readonly canConfirm = this.permissions.has(AppPermissions.PURCHASE_ORDERS_CONFIRM);
  readonly canCancel = this.permissions.has(AppPermissions.PURCHASE_ORDERS_CANCEL);

  items: PurchaseOrder[] = [];
  suppliers: Supplier[] = [];
  products: Product[] = [];
  loading = false;
  error: string | null = null;
  filter = '';
  saving = false;
  actionBusy = false;
  editing: PurchaseOrder | null = null;
  viewing: PurchaseOrder | null = null;
  pendingAction: { type: 'confirm' | 'cancel'; order: PurchaseOrder } | null = null;
  private modalRef?: NgbModalRef;

  form = this.fb.group({
    supplierId: ['', Validators.required],
    notes: ['', Validators.maxLength(500)],
    items: this.fb.array([this.createLineGroup()]),
  });

  ngOnInit(): void {
    this.loadLookups();
    this.load();
  }

  get lines(): FormArray {
    return this.form.get('items') as FormArray;
  }

  get filtered(): PurchaseOrder[] {
    const q = this.filter.trim().toLowerCase();
    if (!q) {
      return this.items;
    }
    return this.items.filter((o) => {
      const supplier = this.supplierLabel(o.supplierId).toLowerCase();
      return (
        o.id.toLowerCase().includes(q) ||
        o.status.toLowerCase().includes(q) ||
        supplier.includes(q) ||
        (o.notes ?? '').toLowerCase().includes(q)
      );
    });
  }

  createLineGroup(productId = '', quantity = '', unitCost = ''): FormGroup {
    return this.fb.group({
      productId: [productId, Validators.required],
      quantity: [
        quantity,
        [Validators.required, Validators.pattern(/^\d+(\.\d{1,6})?$/)],
      ],
      unitCost: [
        unitCost,
        [Validators.required, Validators.pattern(/^\d+(\.\d{1,4})?$/)],
      ],
    });
  }

  supplierLabel(id: string): string {
    const s = this.suppliers.find((x) => x.id === id);
    return s ? `${s.code} — ${s.name}` : id.slice(0, 8);
  }

  productLabel(id: string): string {
    const p = this.products.find((x) => x.id === id);
    return p ? `${p.sku} — ${p.name}` : id.slice(0, 8);
  }

  statusBadgeClass(status: string): string {
    switch (status) {
      case 'DRAFT':
        return 'bg-secondary';
      case 'CONFIRMED':
        return 'bg-primary';
      case 'PARTIALLY_RECEIVED':
        return 'bg-info text-dark';
      case 'RECEIVED':
        return 'bg-success';
      case 'CANCELLED':
        return 'bg-danger';
      default:
        return 'bg-secondary';
    }
  }

  canEditOrder(order: PurchaseOrder): boolean {
    return this.canUpdate && order.status === 'DRAFT';
  }

  canConfirmOrder(order: PurchaseOrder): boolean {
    return this.canConfirm && order.status === 'DRAFT';
  }

  canCancelOrder(order: PurchaseOrder): boolean {
    return (
      this.canCancel &&
      (order.status === 'DRAFT' || order.status === 'CONFIRMED')
    );
  }

  lineTotal(quantity: string, unitCost: string): string {
    if (!quantity || !unitCost) {
      return '—';
    }
    return multiplyDecimals(quantity, unitCost, 4);
  }

  remainingQty(item: { quantity: string; receivedQuantity: string }): string {
    return formatQuantity(subtractDecimals(item.quantity, item.receivedQuantity));
  }

  loadLookups(): void {
    forkJoin({
      suppliers: this.supplierService.list(),
      products: this.productService.list(),
    }).subscribe({
      next: ({ suppliers, products }) => {
        this.suppliers = suppliers.items ?? [];
        this.products = products.items ?? [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load purchase lookups'));
        this.cdr.detectChanges();
      },
    });
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.orders.list().subscribe({
      next: (res) => {
        this.items = res.items ?? [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load purchase orders');
        this.cdr.detectChanges();
      },
    });
  }

  addLine(): void {
    this.lines.push(this.createLineGroup());
  }

  removeLine(index: number): void {
    if (this.lines.length <= 1) {
      return;
    }
    this.lines.removeAt(index);
  }

  openCreate(): void {
    if (!this.canCreate) {
      return;
    }
    this.editing = null;
    this.form.reset({ supplierId: '', notes: '' });
    this.lines.clear();
    this.lines.push(this.createLineGroup());
    this.modalRef = this.modal.open(this.formModal, {
      centered: true,
      size: 'xl',
    });
  }

  openEdit(order: PurchaseOrder): void {
    if (!this.canEditOrder(order)) {
      return;
    }
    this.editing = order;
    this.form.reset({
      supplierId: order.supplierId,
      notes: order.notes ?? '',
    });
    this.lines.clear();
    for (const line of order.items ?? []) {
      this.lines.push(
        this.createLineGroup(line.productId, line.quantity, line.unitCost),
      );
    }
    if (this.lines.length === 0) {
      this.lines.push(this.createLineGroup());
    }
    this.modalRef = this.modal.open(this.formModal, {
      centered: true,
      size: 'xl',
    });
  }

  openDetail(order: PurchaseOrder): void {
    this.viewing = order;
    this.modal.open(this.detailModal, { centered: true, size: 'lg' });
    this.orders.getById(order.id).subscribe({
      next: (detail) => {
        this.viewing = detail;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load order details'));
        this.cdr.detectChanges();
      },
    });
  }

  askConfirm(order: PurchaseOrder): void {
    this.pendingAction = { type: 'confirm', order };
    this.modal.open(this.confirmModal, { centered: true });
  }

  askCancel(order: PurchaseOrder): void {
    this.pendingAction = { type: 'cancel', order };
    this.modal.open(this.confirmModal, { centered: true });
  }

  runPendingAction(modal: { close: () => void }): void {
    if (!this.pendingAction || this.actionBusy) {
      return;
    }
    const { type, order } = this.pendingAction;
    this.actionBusy = true;
    this.cdr.detectChanges();
    const request$ =
      type === 'confirm'
        ? this.orders.confirm(order.id)
        : this.orders.cancel(order.id);

    request$.subscribe({
      next: () => {
        this.actionBusy = false;
        modal.close();
        this.pendingAction = null;
        this.toast.success(
          type === 'confirm' ? 'Purchase order confirmed' : 'Purchase order cancelled',
        );
        this.load();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.actionBusy = false;
        this.toast.error(apiErrorMessage(err, 'Action failed'));
        this.cdr.detectChanges();
      },
    });
  }

  save(): void {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.lines.length === 0) {
      this.toast.error('Add at least one order line.');
      return;
    }

    const rawLines = this.lines.getRawValue() as Array<{
      productId: string;
      quantity: string;
      unitCost: string;
    }>;
    for (const line of rawLines) {
      if (!isPositiveDecimal(line.quantity) || !isPositiveDecimal(line.unitCost)) {
        this.toast.error('Each line needs a positive quantity and unit cost.');
        return;
      }
    }

    const value = this.form.getRawValue();
    const notes = value.notes?.trim() || undefined;
    const items = rawLines.map((line) => ({
      productId: line.productId,
      quantity: String(line.quantity).trim(),
      unitCost: String(line.unitCost).trim(),
    }));

    this.saving = true;
    this.cdr.detectChanges();

    const request$ = this.editing
      ? this.orders.update(this.editing.id, {
          supplierId: value.supplierId!,
          notes,
          items,
        })
      : this.orders.create({
          supplierId: value.supplierId!,
          notes,
          items,
        });

    request$.subscribe({
      next: () => {
        this.saving = false;
        this.modalRef?.close();
        this.toast.success(
          this.editing ? 'Purchase order updated' : 'Purchase order created',
        );
        this.load();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.saving = false;
        this.toast.error(apiErrorMessage(err, 'Save failed'));
        this.cdr.detectChanges();
      },
    });
  }
}
