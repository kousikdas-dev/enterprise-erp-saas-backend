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
import { forkJoin, Observable } from 'rxjs';
import { AppPermissions } from '../../../core/permissions/permissions.constants';
import { PermissionService } from '../../../core/permissions/permission.service';
import { ProductService } from '../../inventory/products/product.service';
import { Product } from '../../inventory/models/inventory.models';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  isPositiveDecimal,
  multiplyDecimals,
} from '../../../shared/utils/decimal.util';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { Customer, SalesOrder } from '../models/sales.models';
import { CustomerService } from '../customers/customer.service';
import { SalesOrderService } from './sales-order.service';

@Component({
  selector: 'app-sales-order-list',
  templateUrl: './sales-order-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class SalesOrderListComponent implements OnInit {
  @ViewChild('formModal') formModal!: TemplateRef<unknown>;
  @ViewChild('detailModal') detailModal!: TemplateRef<unknown>;
  @ViewChild('confirmModal') confirmModal!: TemplateRef<unknown>;

  private readonly orders = inject(SalesOrderService);
  private readonly customerService = inject(CustomerService);
  private readonly productService = inject(ProductService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canCreate = this.permissions.has(AppPermissions.SALES_ORDERS_CREATE);
  readonly canUpdate = this.permissions.has(AppPermissions.SALES_ORDERS_UPDATE);
  readonly canConfirm = this.permissions.has(AppPermissions.SALES_ORDERS_CONFIRM);
  readonly canCancel = this.permissions.has(AppPermissions.SALES_ORDERS_CANCEL);
  readonly canCreateProforma = this.permissions.has(AppPermissions.PROFORMA_INVOICES_CREATE);
  readonly canCreateInvoice = this.permissions.has(AppPermissions.SALES_INVOICES_CREATE);

  items: SalesOrder[] = [];
  customers: Customer[] = [];
  products: Product[] = [];
  loading = false;
  error: string | null = null;
  filter = '';
  saving = false;
  actionBusy = false;
  editing: SalesOrder | null = null;
  viewing: SalesOrder | null = null;
  pendingAction: {
    type: 'confirm' | 'cancel' | 'proforma' | 'invoice';
    order: SalesOrder;
  } | null = null;
  private modalRef?: NgbModalRef;

  form = this.fb.group({
    customerId: ['', Validators.required],
    notes: ['', Validators.maxLength(500)],
    billingAddress: ['', Validators.maxLength(500)],
    shippingAddress: ['', Validators.maxLength(500)],
    items: this.fb.array([this.createLineGroup()]),
  });

  ngOnInit(): void {
    this.loadLookups();
    this.load();
  }

  get lines(): FormArray {
    return this.form.get('items') as FormArray;
  }

  get filtered(): SalesOrder[] {
    const q = this.filter.trim().toLowerCase();
    if (!q) {
      return this.items;
    }
    return this.items.filter(
      (o) =>
        o.id.toLowerCase().includes(q) ||
        o.status.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        (o.notes ?? '').toLowerCase().includes(q),
    );
  }

  createLineGroup(productId = '', quantity = '', unitPrice = ''): FormGroup {
    return this.fb.group({
      productId: [productId, Validators.required],
      quantity: [
        quantity,
        [Validators.required, Validators.pattern(/^\d+(\.\d{1,6})?$/)],
      ],
      unitPrice: [
        unitPrice,
        [Validators.required, Validators.pattern(/^\d+(\.\d{1,4})?$/)],
      ],
    });
  }

  customerLabel(id: string): string {
    const c = this.customers.find((x) => x.id === id);
    return c ? `${c.code} — ${c.name}` : id.slice(0, 8);
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
      case 'PARTIALLY_SHIPPED':
        return 'bg-info text-dark';
      case 'SHIPPED':
        return 'bg-success';
      case 'CANCELLED':
        return 'bg-danger';
      default:
        return 'bg-secondary';
    }
  }

  canEditOrder(order: SalesOrder): boolean {
    return this.canUpdate && order.status === 'DRAFT';
  }

  canConfirmOrder(order: SalesOrder): boolean {
    return this.canConfirm && order.status === 'DRAFT';
  }

  canCancelOrder(order: SalesOrder): boolean {
    return (
      this.canCancel &&
      (order.status === 'DRAFT' || order.status === 'CONFIRMED')
    );
  }

  canCreateProformaFor(order: SalesOrder): boolean {
    return this.canCreateProforma && order.status === 'CONFIRMED';
  }

  canCreateInvoiceFor(order: SalesOrder): boolean {
    return this.canCreateInvoice && order.status !== 'CANCELLED';
  }

  lineTotal(quantity: string, unitPrice: string): string {
    if (!quantity || !unitPrice) {
      return '—';
    }
    return multiplyDecimals(quantity, unitPrice, 4);
  }

  loadLookups(): void {
    forkJoin({
      customers: this.customerService.list(),
      products: this.productService.list(),
    }).subscribe({
      next: ({ customers, products }) => {
        this.customers = customers.items ?? [];
        this.products = products.items ?? [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load sales order lookups'));
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
        this.error = apiErrorMessage(err, 'Failed to load sales orders');
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
    this.form.reset({ customerId: '', notes: '', billingAddress: '', shippingAddress: '' });
    this.lines.clear();
    this.lines.push(this.createLineGroup());
    this.modalRef = this.modal.open(this.formModal, { centered: true, size: 'xl' });
  }

  openEdit(order: SalesOrder): void {
    if (!this.canEditOrder(order)) {
      return;
    }
    this.editing = order;
    this.form.reset({
      customerId: order.customerId,
      notes: order.notes ?? '',
      billingAddress: '',
      shippingAddress: '',
    });
    this.lines.clear();
    for (const line of order.items ?? []) {
      this.lines.push(
        this.createLineGroup(line.productId, line.orderedQuantity, line.unitPrice),
      );
    }
    if (this.lines.length === 0) {
      this.lines.push(this.createLineGroup());
    }
    this.modalRef = this.modal.open(this.formModal, { centered: true, size: 'xl' });
  }

  openDetail(order: SalesOrder): void {
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

  askConfirm(order: SalesOrder): void {
    this.pendingAction = { type: 'confirm', order };
    this.modal.open(this.confirmModal, { centered: true });
  }

  askCancel(order: SalesOrder): void {
    this.pendingAction = { type: 'cancel', order };
    this.modal.open(this.confirmModal, { centered: true });
  }

  askProforma(order: SalesOrder): void {
    this.pendingAction = { type: 'proforma', order };
    this.modal.open(this.confirmModal, { centered: true });
  }

  askInvoice(order: SalesOrder): void {
    this.pendingAction = { type: 'invoice', order };
    this.modal.open(this.confirmModal, { centered: true });
  }

  confirmTitle(type: 'confirm' | 'cancel' | 'proforma' | 'invoice'): string {
    switch (type) {
      case 'confirm':
        return 'Confirm sales order';
      case 'cancel':
        return 'Cancel sales order';
      case 'proforma':
        return 'Create proforma invoice';
      case 'invoice':
        return 'Create sales invoice';
    }
  }

  runPendingAction(modal: { close: () => void }): void {
    if (!this.pendingAction || this.actionBusy) {
      return;
    }
    const { type, order } = this.pendingAction;
    this.actionBusy = true;
    this.cdr.detectChanges();
    const request$: Observable<unknown> =
      type === 'confirm'
        ? this.orders.confirm(order.id)
        : type === 'cancel'
          ? this.orders.cancel(order.id)
          : type === 'proforma'
            ? this.orders.createProforma(order.id)
            : this.orders.createInvoice(order.id);

    request$.subscribe({
      next: () => {
        this.actionBusy = false;
        modal.close();
        this.pendingAction = null;
        this.toast.success(
          type === 'confirm'
            ? 'Sales order confirmed'
            : type === 'cancel'
              ? 'Sales order cancelled'
              : type === 'proforma'
                ? 'Proforma invoice created'
                : 'Sales invoice created',
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
      unitPrice: string;
    }>;
    for (const line of rawLines) {
      if (!isPositiveDecimal(line.quantity) || !isPositiveDecimal(line.unitPrice)) {
        this.toast.error('Each line needs a positive quantity and unit price.');
        return;
      }
      if (!this.products.find((p) => p.id === line.productId)) {
        this.toast.error('Select a valid product for every line.');
        return;
      }
    }

    const value = this.form.getRawValue();
    const notes = value.notes?.trim() || undefined;
    const billingAddress = value.billingAddress?.trim() || undefined;
    const shippingAddress = value.shippingAddress?.trim() || undefined;
    const items = rawLines.map((line) => {
      const product = this.products.find((p) => p.id === line.productId)!;
      return {
        productId: line.productId,
        productSku: product.sku,
        productName: product.name,
        quantity: String(line.quantity).trim(),
        unitPrice: String(line.unitPrice).trim(),
      };
    });

    this.saving = true;
    this.cdr.detectChanges();

    const request$ = this.editing
      ? this.orders.update(this.editing.id, {
          customerId: value.customerId!,
          notes,
          billingAddress: billingAddress ?? null,
          shippingAddress: shippingAddress ?? null,
          items,
        })
      : this.orders.create({
          customerId: value.customerId!,
          notes,
          billingAddress,
          shippingAddress,
          items,
        });

    request$.subscribe({
      next: () => {
        this.saving = false;
        this.modalRef?.close();
        this.toast.success(this.editing ? 'Sales order updated' : 'Sales order created');
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
