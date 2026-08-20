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
import { Customer, Quotation } from '../models/sales.models';
import { CustomerService } from '../customers/customer.service';
import { QuotationService } from './quotation.service';

type QuotationAction =
  | 'send'
  | 'accept'
  | 'reject'
  | 'cancel'
  | 'proforma'
  | 'convert';

@Component({
  selector: 'app-quotation-list',
  templateUrl: './quotation-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class QuotationListComponent implements OnInit {
  @ViewChild('formModal') formModal!: TemplateRef<unknown>;
  @ViewChild('detailModal') detailModal!: TemplateRef<unknown>;
  @ViewChild('actionModal') actionModal!: TemplateRef<unknown>;

  private readonly quotations = inject(QuotationService);
  private readonly customerService = inject(CustomerService);
  private readonly productService = inject(ProductService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canCreate = this.permissions.has(AppPermissions.QUOTATIONS_CREATE);
  readonly canUpdate = this.permissions.has(AppPermissions.QUOTATIONS_UPDATE);
  readonly canSend = this.permissions.has(AppPermissions.QUOTATIONS_SEND);
  readonly canAccept = this.permissions.has(AppPermissions.QUOTATIONS_ACCEPT);
  readonly canReject = this.permissions.has(AppPermissions.QUOTATIONS_REJECT);
  readonly canCancel = this.permissions.has(AppPermissions.QUOTATIONS_CANCEL);
  readonly canCreateProforma = this.permissions.has(AppPermissions.PROFORMA_INVOICES_CREATE);
  readonly canConvertToOrder = this.permissions.has(AppPermissions.SALES_ORDERS_CREATE);

  items: Quotation[] = [];
  customers: Customer[] = [];
  products: Product[] = [];
  loading = false;
  error: string | null = null;
  filter = '';
  saving = false;
  actionBusy = false;
  editing: Quotation | null = null;
  viewing: Quotation | null = null;
  pendingAction: { type: QuotationAction; quotation: Quotation } | null = null;
  private modalRef?: NgbModalRef;

  form = this.fb.group({
    customerId: ['', Validators.required],
    notes: ['', Validators.maxLength(500)],
    validUntil: [''],
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

  get filtered(): Quotation[] {
    const q = this.filter.trim().toLowerCase();
    if (!q) {
      return this.items;
    }
    return this.items.filter(
      (item) =>
        item.id.toLowerCase().includes(q) ||
        item.status.toLowerCase().includes(q) ||
        item.customerName.toLowerCase().includes(q) ||
        (item.notes ?? '').toLowerCase().includes(q),
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
      case 'SENT':
        return 'bg-primary';
      case 'ACCEPTED':
        return 'bg-success';
      case 'REJECTED':
        return 'bg-danger';
      case 'CANCELLED':
        return 'bg-dark';
      default:
        return 'bg-secondary';
    }
  }

  canEditQuotation(q: Quotation): boolean {
    return this.canUpdate && q.status === 'DRAFT';
  }

  canSendQuotation(q: Quotation): boolean {
    return this.canSend && q.status === 'DRAFT';
  }

  canAcceptQuotation(q: Quotation): boolean {
    return this.canAccept && q.status === 'SENT';
  }

  canRejectQuotation(q: Quotation): boolean {
    return this.canReject && q.status === 'SENT';
  }

  canCancelQuotation(q: Quotation): boolean {
    return this.canCancel && (q.status === 'DRAFT' || q.status === 'SENT');
  }

  canCreateProformaFor(q: Quotation): boolean {
    return this.canCreateProforma && q.status === 'ACCEPTED';
  }

  canConvertQuotation(q: Quotation): boolean {
    return this.canConvertToOrder && q.status === 'ACCEPTED';
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
        this.toast.error(apiErrorMessage(err, 'Failed to load quotation lookups'));
        this.cdr.detectChanges();
      },
    });
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.quotations.list().subscribe({
      next: (res) => {
        this.items = res.items ?? [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load quotations');
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
    this.form.reset({
      customerId: '',
      notes: '',
      validUntil: '',
      billingAddress: '',
      shippingAddress: '',
    });
    this.lines.clear();
    this.lines.push(this.createLineGroup());
    this.modalRef = this.modal.open(this.formModal, { centered: true, size: 'xl' });
  }

  openEdit(item: Quotation): void {
    if (!this.canEditQuotation(item)) {
      return;
    }
    this.editing = item;
    this.form.reset({
      customerId: item.customerId,
      notes: item.notes ?? '',
      validUntil: '',
      billingAddress: item.billingAddress ?? '',
      shippingAddress: item.shippingAddress ?? '',
    });
    this.lines.clear();
    for (const line of item.items ?? []) {
      this.lines.push(
        this.createLineGroup(line.productId, line.quantity, line.unitPrice),
      );
    }
    if (this.lines.length === 0) {
      this.lines.push(this.createLineGroup());
    }
    this.modalRef = this.modal.open(this.formModal, { centered: true, size: 'xl' });
  }

  openDetail(item: Quotation): void {
    this.viewing = item;
    this.modal.open(this.detailModal, { centered: true, size: 'lg' });
    this.quotations.getById(item.id).subscribe({
      next: (detail) => {
        this.viewing = detail;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load quotation details'));
        this.cdr.detectChanges();
      },
    });
  }

  askAction(type: QuotationAction, quotation: Quotation): void {
    this.pendingAction = { type, quotation };
    this.modal.open(this.actionModal, { centered: true });
  }

  actionLabel(type: QuotationAction): string {
    switch (type) {
      case 'send':
        return 'Send quotation';
      case 'accept':
        return 'Accept quotation';
      case 'reject':
        return 'Reject quotation';
      case 'cancel':
        return 'Cancel quotation';
      case 'proforma':
        return 'Create proforma invoice';
      case 'convert':
        return 'Convert to sales order';
    }
  }

  runPendingAction(modal: { close: () => void }): void {
    if (!this.pendingAction || this.actionBusy) {
      return;
    }
    const { type, quotation } = this.pendingAction;
    this.actionBusy = true;
    this.cdr.detectChanges();

    const request$: Observable<unknown> =
      type === 'send'
        ? this.quotations.send(quotation.id)
        : type === 'accept'
          ? this.quotations.accept(quotation.id)
          : type === 'reject'
            ? this.quotations.reject(quotation.id)
            : type === 'cancel'
              ? this.quotations.cancel(quotation.id)
              : type === 'proforma'
                ? this.quotations.createProforma(quotation.id)
                : this.quotations.convertToOrder(quotation.id);

    request$.subscribe({
      next: () => {
        this.actionBusy = false;
        modal.close();
        this.pendingAction = null;
        this.toast.success(`${this.actionLabel(type)} succeeded`);
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
      this.toast.error('Add at least one line.');
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
    const validUntil = value.validUntil?.trim() || undefined;
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
      ? this.quotations.update(this.editing.id, {
          customerId: value.customerId!,
          notes,
          validUntil: validUntil ?? null,
          billingAddress: billingAddress ?? null,
          shippingAddress: shippingAddress ?? null,
          items,
        })
      : this.quotations.create({
          customerId: value.customerId!,
          notes,
          validUntil,
          billingAddress,
          shippingAddress,
          items,
        });

    request$.subscribe({
      next: () => {
        this.saving = false;
        this.modalRef?.close();
        this.toast.success(this.editing ? 'Quotation updated' : 'Quotation created');
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
