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
import {
  Customer,
  CustomerAddress,
  CustomerAddressType,
  Quotation,
} from '../models/sales.models';
import { CustomerService } from '../customers/customer.service';
import { QuotationService } from './quotation.service';
import { MasterDataOption } from '../../../shared/master-data/master-data.models';
import { MasterDataService } from '../../../shared/master-data/master-data.service';
import {
  SALESPERSON_ROLE,
  User,
} from '../../administration/models/administration.models';
import { UserService } from '../../administration/users/user.service';

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
  private readonly masterData = inject(MasterDataService);
  private readonly users = inject(UserService);
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
  paymentTerms: MasterDataOption[] = [];
  salespeople: User[] = [];
  billingAddresses: CustomerAddress[] = [];
  shippingAddresses: CustomerAddress[] = [];
  loading = false;
  error: string | null = null;
  filter = '';
  saving = false;
  actionBusy = false;
  editing: Quotation | null = null;
  viewing: Quotation | null = null;
  pendingAction: { type: QuotationAction; quotation: Quotation } | null = null;
  private modalRef?: NgbModalRef;
  private formResetting = false;

  form = this.fb.group({
    customerId: ['', Validators.required],
    notes: ['', Validators.maxLength(500)],
    validUntil: [''],
    billingAddress: ['', Validators.maxLength(500)],
    shippingAddress: ['', Validators.maxLength(500)],
    billingAddressId: [''],
    shippingAddressId: [''],
    paymentTermId: [''],
    salespersonId: [''],
    deliveryDate: [''],
    items: this.fb.array([this.createLineGroup()]),
  });

  ngOnInit(): void {
    this.loadLookups();
    this.load();

    this.form.get('customerId')!.valueChanges.subscribe((customerId) => {
      if (this.formResetting) {
        return;
      }
      this.applyCustomerAddresses(customerId ?? '');
      this.cdr.detectChanges();
    });

    this.form.get('billingAddressId')!.valueChanges.subscribe((addressId) => {
      if (this.formResetting || !addressId) {
        return;
      }
      const address = this.billingAddresses.find((a) => a.id === addressId);
      if (address) {
        this.form.get('billingAddress')!.setValue(this.addressLabel(address));
        this.cdr.detectChanges();
      }
    });

    this.form.get('shippingAddressId')!.valueChanges.subscribe((addressId) => {
      if (this.formResetting || !addressId) {
        return;
      }
      const address = this.shippingAddresses.find((a) => a.id === addressId);
      if (address) {
        this.form.get('shippingAddress')!.setValue(this.addressLabel(address));
        this.cdr.detectChanges();
      }
    });
  }

  /**
   * Recomputes billing/shipping dropdown options for a customer and, since
   * this only runs on an explicit customer change (not on form.reset), also
   * overwrites the address snapshot and the payment-term/salesperson
   * selection with the new customer's defaults.
   */
  private applyCustomerAddresses(customerId: string): void {
    const customer = this.customers.find((c) => c.id === customerId);
    this.billingAddresses = this.activeAddressesOf(customer, 'BILLING');
    this.shippingAddresses = this.activeAddressesOf(customer, 'SHIPPING');
    const defaultBilling = this.billingAddresses[0] ?? null;
    const defaultShipping = this.shippingAddresses[0] ?? null;
    this.form.patchValue({
      billingAddressId: defaultBilling?.id ?? '',
      shippingAddressId: defaultShipping?.id ?? '',
      billingAddress: defaultBilling ? this.addressLabel(defaultBilling) : '',
      shippingAddress: defaultShipping ? this.addressLabel(defaultShipping) : '',
      paymentTermId: customer?.paymentTermId ?? '',
      salespersonId: customer?.salespersonId ?? '',
    });
  }

  private activeAddressesOf(
    customer: Customer | undefined,
    type: CustomerAddressType,
  ): CustomerAddress[] {
    if (!customer?.addresses?.length) {
      return [];
    }
    return customer.addresses
      .filter((a) => a.type === type && a.isActive)
      .slice()
      .sort((a, b) => (a.isDefault === b.isDefault ? 0 : a.isDefault ? -1 : 1));
  }

  addressLabel(a: CustomerAddress): string {
    const parts = [a.addressLine1, a.addressLine2, a.city, a.state, a.postalCode, a.country].filter(
      (p): p is string => !!p,
    );
    return `${a.name} — ${parts.join(', ')}`;
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
      paymentTerms: this.masterData.paymentTerms(),
      salespeople: this.users.list({ role: SALESPERSON_ROLE }),
    }).subscribe({
      next: ({ customers, products, paymentTerms, salespeople }) => {
        this.customers = customers.items ?? [];
        this.products = products.items ?? [];
        this.paymentTerms = (paymentTerms.items ?? []).filter((p) => p.isActive);
        this.salespeople = (salespeople.items ?? []).filter(
          (u) => u.status === 'ACTIVE',
        );
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load quotation lookups'));
        this.cdr.detectChanges();
      },
    });
  }

  salespersonLabel(id: string | null): string {
    if (!id) {
      return '—';
    }
    const u = this.salespeople.find((x) => x.id === id);
    return u ? `${u.firstName} ${u.lastName}`.trim() || u.email : id.slice(0, 8);
  }

  paymentTermLabel(id: string | null): string {
    if (!id) {
      return '—';
    }
    const p = this.paymentTerms.find((x) => x.id === id);
    return p ? p.name : id.slice(0, 8);
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
    this.billingAddresses = [];
    this.shippingAddresses = [];
    this.formResetting = true;
    this.form.reset({
      customerId: '',
      notes: '',
      validUntil: '',
      billingAddress: '',
      shippingAddress: '',
      billingAddressId: '',
      shippingAddressId: '',
      paymentTermId: '',
      salespersonId: '',
      deliveryDate: '',
    });
    this.formResetting = false;
    this.lines.clear();
    this.lines.push(this.createLineGroup());
    this.cdr.detectChanges();
    this.modalRef = this.modal.open(this.formModal, { centered: true, size: 'xl' });
  }

  openEdit(item: Quotation): void {
    if (!this.canEditQuotation(item)) {
      return;
    }
    this.editing = item;
    // Preserve the saved address snapshot on open — only an explicit customer
    // or address-dropdown change (via applyCustomerAddresses) should overwrite it.
    this.formResetting = true;
    this.form.reset({
      customerId: item.customerId,
      notes: item.notes ?? '',
      validUntil: item.validUntil ? item.validUntil.slice(0, 10) : '',
      billingAddress: item.billingAddress ?? '',
      shippingAddress: item.shippingAddress ?? '',
      billingAddressId: '',
      shippingAddressId: '',
      paymentTermId: item.paymentTermId ?? '',
      salespersonId: item.salespersonId ?? '',
      deliveryDate: item.deliveryDate ? item.deliveryDate.slice(0, 10) : '',
    });
    this.formResetting = false;
    const customer = this.customers.find((c) => c.id === item.customerId);
    this.billingAddresses = this.activeAddressesOf(customer, 'BILLING');
    this.shippingAddresses = this.activeAddressesOf(customer, 'SHIPPING');
    this.lines.clear();
    for (const line of item.items ?? []) {
      this.lines.push(
        this.createLineGroup(line.productId, line.quantity, line.unitPrice),
      );
    }
    if (this.lines.length === 0) {
      this.lines.push(this.createLineGroup());
    }
    this.cdr.detectChanges();
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
    const paymentTermId = value.paymentTermId?.trim() || undefined;
    const salespersonId = value.salespersonId?.trim() || undefined;
    const deliveryDate = value.deliveryDate?.trim() || undefined;
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
          paymentTermId: paymentTermId ?? null,
          salespersonId: salespersonId ?? null,
          deliveryDate: deliveryDate ?? null,
          items,
        })
      : this.quotations.create({
          customerId: value.customerId!,
          notes,
          validUntil,
          billingAddress,
          shippingAddress,
          paymentTermId,
          salespersonId,
          deliveryDate,
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
