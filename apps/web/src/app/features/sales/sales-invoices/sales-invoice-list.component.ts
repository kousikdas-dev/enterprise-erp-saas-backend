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
  SalesInvoice,
} from '../models/sales.models';
import { CustomerService } from '../customers/customer.service';
import { SalesInvoiceService } from './sales-invoice.service';
import { MasterDataOption } from '../../../shared/master-data/master-data.models';
import { MasterDataService } from '../../../shared/master-data/master-data.service';
import {
  SALESPERSON_ROLE,
  User,
} from '../../administration/models/administration.models';
import { UserService } from '../../administration/users/user.service';

type SalesInvoiceAction = 'send' | 'cancel';

@Component({
  selector: 'app-sales-invoice-list',
  templateUrl: './sales-invoice-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class SalesInvoiceListComponent implements OnInit {
  @ViewChild('formModal') formModal!: TemplateRef<unknown>;
  @ViewChild('detailModal') detailModal!: TemplateRef<unknown>;
  @ViewChild('actionModal') actionModal!: TemplateRef<unknown>;

  private readonly invoices = inject(SalesInvoiceService);
  private readonly customerService = inject(CustomerService);
  private readonly productService = inject(ProductService);
  private readonly masterData = inject(MasterDataService);
  private readonly users = inject(UserService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canCreate = this.permissions.has(AppPermissions.SALES_INVOICES_CREATE);
  readonly canUpdate = this.permissions.has(AppPermissions.SALES_INVOICES_UPDATE);
  readonly canSend = this.permissions.has(AppPermissions.SALES_INVOICES_SEND);
  readonly canCancel = this.permissions.has(AppPermissions.SALES_INVOICES_CANCEL);

  items: SalesInvoice[] = [];
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
  editing: SalesInvoice | null = null;
  viewing: SalesInvoice | null = null;
  pendingAction: { type: SalesInvoiceAction; invoice: SalesInvoice } | null = null;
  private modalRef?: NgbModalRef;
  private formResetting = false;

  form = this.fb.group({
    customerId: ['', Validators.required],
    notes: ['', Validators.maxLength(500)],
    invoiceDate: [''],
    dueDate: [''],
    billingAddress: ['', Validators.maxLength(500)],
    shippingAddress: ['', Validators.maxLength(500)],
    billingAddressId: [''],
    shippingAddressId: [''],
    paymentTermId: [''],
    salespersonId: [''],
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

  get filtered(): SalesInvoice[] {
    const q = this.filter.trim().toLowerCase();
    if (!q) {
      return this.items;
    }
    return this.items.filter(
      (item) =>
        item.invoiceNumber.toLowerCase().includes(q) ||
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
        return 'bg-success';
      case 'CANCELLED':
        return 'bg-dark';
      default:
        return 'bg-secondary';
    }
  }

  canEditInvoice(item: SalesInvoice): boolean {
    return this.canUpdate && item.status === 'DRAFT';
  }

  canSendInvoice(item: SalesInvoice): boolean {
    return this.canSend && item.status === 'DRAFT';
  }

  canCancelInvoice(item: SalesInvoice): boolean {
    return this.canCancel && (item.status === 'DRAFT' || item.status === 'SENT');
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
        this.toast.error(apiErrorMessage(err, 'Failed to load sales invoice lookups'));
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
    this.invoices.list().subscribe({
      next: (res) => {
        this.items = res.items ?? [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load sales invoices');
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
      invoiceDate: '',
      dueDate: '',
      billingAddress: '',
      shippingAddress: '',
      billingAddressId: '',
      shippingAddressId: '',
      paymentTermId: '',
      salespersonId: '',
    });
    this.formResetting = false;
    this.lines.clear();
    this.lines.push(this.createLineGroup());
    this.cdr.detectChanges();
    this.modalRef = this.modal.open(this.formModal, { centered: true, size: 'xl' });
  }

  openEdit(item: SalesInvoice): void {
    if (!this.canEditInvoice(item)) {
      return;
    }
    this.editing = item;
    this.formResetting = true;
    this.form.reset({
      customerId: item.customerId,
      notes: item.notes ?? '',
      invoiceDate: item.invoiceDate ? item.invoiceDate.slice(0, 10) : '',
      dueDate: item.dueDate ? item.dueDate.slice(0, 10) : '',
      billingAddress: item.billingAddress ?? '',
      shippingAddress: item.shippingAddress ?? '',
      billingAddressId: '',
      shippingAddressId: '',
      paymentTermId: item.paymentTermId ?? '',
      salespersonId: item.salespersonId ?? '',
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

  openDetail(item: SalesInvoice): void {
    this.viewing = item;
    this.modal.open(this.detailModal, { centered: true, size: 'lg' });
    this.invoices.getById(item.id).subscribe({
      next: (detail) => {
        this.viewing = detail;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load sales invoice details'));
        this.cdr.detectChanges();
      },
    });
  }

  askAction(type: SalesInvoiceAction, invoice: SalesInvoice): void {
    this.pendingAction = { type, invoice };
    this.modal.open(this.actionModal, { centered: true });
  }

  actionLabel(type: SalesInvoiceAction): string {
    switch (type) {
      case 'send':
        return 'Send sales invoice';
      case 'cancel':
        return 'Cancel sales invoice';
    }
  }

  runPendingAction(modal: { close: () => void }): void {
    if (!this.pendingAction || this.actionBusy) {
      return;
    }
    const { type, invoice } = this.pendingAction;
    this.actionBusy = true;
    this.cdr.detectChanges();

    const request$: Observable<unknown> =
      type === 'send' ? this.invoices.send(invoice.id) : this.invoices.cancel(invoice.id);

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
    const invoiceDate = value.invoiceDate?.trim() || undefined;
    const dueDate = value.dueDate?.trim() || undefined;
    const billingAddress = value.billingAddress?.trim() || undefined;
    const shippingAddress = value.shippingAddress?.trim() || undefined;
    const paymentTermId = value.paymentTermId?.trim() || undefined;
    const salespersonId = value.salespersonId?.trim() || undefined;
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
      ? this.invoices.update(this.editing.id, {
          customerId: value.customerId!,
          notes,
          invoiceDate,
          dueDate: dueDate ?? null,
          billingAddress: billingAddress ?? null,
          shippingAddress: shippingAddress ?? null,
          paymentTermId: paymentTermId ?? null,
          salespersonId: salespersonId ?? null,
          items,
        })
      : this.invoices.create({
          customerId: value.customerId!,
          notes,
          invoiceDate,
          dueDate,
          billingAddress,
          shippingAddress,
          paymentTermId,
          salespersonId,
          items,
        });

    request$.subscribe({
      next: () => {
        this.saving = false;
        this.modalRef?.close();
        this.toast.success(this.editing ? 'Sales invoice updated' : 'Sales invoice created');
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
