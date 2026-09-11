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
import { UnitService } from '../../inventory/units/unit.service';
import { Product, ProductUnit, Unit } from '../../inventory/models/inventory.models';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  isPositiveDecimal,
  multiplyDecimals,
  percentageOfDecimal,
  subtractDecimals,
  sumDecimals,
} from '../../../shared/utils/decimal.util';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import {
  Customer,
  CustomerAddress,
  CustomerAddressType,
  SalesOrder,
  SalesOrderItemInput,
} from '../models/sales.models';
import { CustomerService } from '../customers/customer.service';
import { SalesOrderService } from './sales-order.service';
import { MasterDataOption } from '../../../shared/master-data/master-data.models';
import { MasterDataService } from '../../../shared/master-data/master-data.service';
import {
  SALESPERSON_ROLE,
  User,
} from '../../administration/models/administration.models';
import { UserService } from '../../administration/users/user.service';
import { TaxCode } from '../../accounting/models/accounting.models';
import { TaxCodeService } from '../../accounting/tax-codes/tax-code.service';

type SalesOrderAction = 'confirm' | 'cancel' | 'proforma' | 'invoice';

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
  private readonly unitService = inject(UnitService);
  private readonly taxCodeService = inject(TaxCodeService);
  private readonly masterData = inject(MasterDataService);
  private readonly users = inject(UserService);
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
  units: Unit[] = [];
  taxCodes: TaxCode[] = [];
  paymentTerms: MasterDataOption[] = [];
  salespeople: User[] = [];
  billingAddresses: CustomerAddress[] = [];
  shippingAddresses: CustomerAddress[] = [];
  private readonly productUnitsByProduct = new Map<string, ProductUnit[]>();
  private readonly loadingProductUnits = new Set<string>();
  loading = false;
  error: string | null = null;
  filter = '';
  saving = false;
  actionBusy = false;
  editing: SalesOrder | null = null;
  viewing: SalesOrder | null = null;
  pendingAction: {
    type: SalesOrderAction;
    order: SalesOrder;
  } | null = null;
  private modalRef?: NgbModalRef;
  private formResetting = false;

  form = this.fb.group({
    customerId: ['', Validators.required],
    notes: ['', Validators.maxLength(500)],
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

  createLineGroup(
    productId = '',
    quantity = '',
    unitOfMeasureId = '',
    unitPrice = '',
    discountPercent = '',
    taxCodeId = '',
  ): FormGroup {
    const group = this.fb.group({
      productId: [productId, Validators.required],
      quantity: [
        quantity,
        [Validators.required, Validators.pattern(/^\d+(\.\d{1,6})?$/)],
      ],
      unitOfMeasureId: [unitOfMeasureId, Validators.required],
      unitPrice: [
        unitPrice,
        [Validators.required, Validators.pattern(/^\d+(\.\d{1,4})?$/)],
      ],
      discountPercent: [
        discountPercent,
        [Validators.pattern(/^\d+(\.\d{1,2})?$/)],
      ],
      taxCodeId: [taxCodeId],
    });

    group.get('productId')!.valueChanges.subscribe((selectedProductId) => {
      this.onLineProductChange(group, selectedProductId ?? '');
    });
    group.get('unitOfMeasureId')!.valueChanges.subscribe((selectedUomId) => {
      this.onLineUomChange(group, selectedUomId ?? '');
    });

    return group;
  }

  /** Selecting a product defaults its UOM to the base unit and its price from Product.sellingPrice. */
  private onLineProductChange(group: FormGroup, productId: string): void {
    const product = this.products.find((p) => p.id === productId);
    if (!product) {
      return;
    }
    group.patchValue(
      { unitOfMeasureId: product.unitOfMeasureId, unitPrice: product.sellingPrice },
      { emitEvent: false },
    );
    this.ensureProductUnitsLoaded(productId);
  }

  /** Selecting an alternative UOM defaults price from that ProductUnit.sellingPrice (never derived from conversionFactor). */
  private onLineUomChange(group: FormGroup, unitOfMeasureId: string): void {
    const productId = group.get('productId')!.value as string;
    const product = this.products.find((p) => p.id === productId);
    if (!product || !unitOfMeasureId) {
      return;
    }
    if (unitOfMeasureId === product.unitOfMeasureId) {
      group.get('unitPrice')!.setValue(product.sellingPrice, { emitEvent: false });
      return;
    }
    const alternatives = this.productUnitsByProduct.get(productId) ?? [];
    const match = alternatives.find((u) => u.unitOfMeasureId === unitOfMeasureId);
    if (match) {
      group.get('unitPrice')!.setValue(match.sellingPrice, { emitEvent: false });
    }
  }

  private ensureProductUnitsLoaded(productId: string): void {
    if (!productId || this.productUnitsByProduct.has(productId) || this.loadingProductUnits.has(productId)) {
      return;
    }
    this.loadingProductUnits.add(productId);
    this.productService.listUnits(productId).subscribe({
      next: (res) => {
        this.productUnitsByProduct.set(productId, res.items ?? []);
        this.loadingProductUnits.delete(productId);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loadingProductUnits.delete(productId);
        this.toast.error(apiErrorMessage(err, 'Failed to load UOM options'));
        this.cdr.detectChanges();
      },
    });
  }

  /** UOM select options for a line's chosen product: base unit + active alternative units. */
  uomOptionsFor(productId: string): Array<{ id: string; label: string }> {
    const product = this.products.find((p) => p.id === productId);
    if (!product) {
      return [];
    }
    const options: Array<{ id: string; label: string }> = [];
    const baseUnit = this.units.find((u) => u.id === product.unitOfMeasureId);
    if (baseUnit) {
      options.push({ id: baseUnit.id, label: `${baseUnit.code} — ${baseUnit.name}` });
    }
    const alternatives = this.productUnitsByProduct.get(productId) ?? [];
    for (const alt of alternatives) {
      if (!alt.isActive || alt.unitOfMeasureId === product.unitOfMeasureId) {
        continue;
      }
      const unit = this.units.find((u) => u.id === alt.unitOfMeasureId);
      if (unit) {
        options.push({ id: unit.id, label: `${unit.code} — ${unit.name}` });
      }
    }
    return options;
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
      case 'PARTIALLY_FULFILLED':
        return 'bg-info text-dark';
      case 'FULFILLED':
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

  /** Each tax component's amount, rounded independently from the same lineSubtotal — never combined into one rate. */
  private taxComponentAmounts(
    lineSubtotal: string,
    taxCodeId: string | null | undefined,
  ): string[] {
    if (!taxCodeId) {
      return [];
    }
    const taxCode = this.taxCodes.find((t) => t.id === taxCodeId);
    if (!taxCode) {
      return [];
    }
    return taxCode.components.map((component) =>
      percentageOfDecimal(lineSubtotal, component.rate, 4),
    );
  }

  /**
   * Mirrors the backend formula exactly: gross → discountAmount → lineSubtotal →
   * each tax component independently → taxAmount → lineTotal. All arithmetic uses
   * the decimal-string utilities (HALF_UP at 4dp for gross/discount/each tax
   * component; subtraction and summation are exact over already-rounded values).
   * Returns null when quantity/unitPrice are missing or invalid.
   */
  private computeLineAmounts(line: {
    quantity: string;
    unitPrice: string;
    discountPercent: string;
    taxCodeId: string;
  }): {
    gross: string;
    discountAmount: string;
    lineSubtotal: string;
    taxAmount: string;
    lineTotal: string;
  } | null {
    if (!isPositiveDecimal(line.quantity) || !isPositiveDecimal(line.unitPrice)) {
      return null;
    }
    const gross = multiplyDecimals(line.quantity, line.unitPrice, 4);
    const discountPercent = line.discountPercent?.trim() || '0';
    const discountAmount = percentageOfDecimal(gross, discountPercent, 4);
    const lineSubtotal = subtractDecimals(gross, discountAmount, 4);
    const taxAmount = sumDecimals(
      this.taxComponentAmounts(lineSubtotal, line.taxCodeId),
      4,
    );
    const lineTotal = sumDecimals([lineSubtotal, taxAmount], 4);
    return { gross, discountAmount, lineSubtotal, taxAmount, lineTotal };
  }

  /**
   * Display-only preview mirroring the backend formula (gross → discount → subtotal → tax → total).
   * The saved sales order's response from the server is always authoritative.
   */
  linePreview(line: {
    quantity: string;
    unitPrice: string;
    discountPercent: string;
    taxCodeId: string;
  }): { lineSubtotal: string; taxAmount: string; lineTotal: string } {
    const amounts = this.computeLineAmounts(line);
    if (!amounts) {
      return { lineSubtotal: '—', taxAmount: '—', lineTotal: '—' };
    }
    return {
      lineSubtotal: amounts.lineSubtotal,
      taxAmount: amounts.taxAmount,
      lineTotal: amounts.lineTotal,
    };
  }

  /** Document-level totals preview, summed from the same per-line amounts above. Display-only. */
  get formTotalsPreview(): {
    subtotal: string;
    discountTotal: string;
    taxTotal: string;
    grandTotal: string;
  } {
    const grossAmounts: string[] = [];
    const discountAmounts: string[] = [];
    const taxAmounts: string[] = [];
    for (const control of this.lines.controls) {
      const v = control.value as {
        quantity: string;
        unitPrice: string;
        discountPercent: string;
        taxCodeId: string;
      };
      const amounts = this.computeLineAmounts(v);
      if (!amounts) {
        continue;
      }
      grossAmounts.push(amounts.gross);
      discountAmounts.push(amounts.discountAmount);
      taxAmounts.push(amounts.taxAmount);
    }
    const subtotal = sumDecimals(grossAmounts, 4);
    const discountTotal = sumDecimals(discountAmounts, 4);
    const taxTotal = sumDecimals(taxAmounts, 4);
    const grandTotal = sumDecimals(
      [subtractDecimals(subtotal, discountTotal, 4), taxTotal],
      4,
    );
    return { subtotal, discountTotal, taxTotal, grandTotal };
  }

  loadLookups(): void {
    forkJoin({
      customers: this.customerService.list(),
      products: this.productService.list(),
      units: this.unitService.list(),
      taxCodes: this.taxCodeService.list(),
      paymentTerms: this.masterData.paymentTerms(),
      salespeople: this.users.list({ role: SALESPERSON_ROLE }),
    }).subscribe({
      next: ({ customers, products, units, taxCodes, paymentTerms, salespeople }) => {
        this.customers = customers.items ?? [];
        this.products = products.items ?? [];
        this.units = units.items ?? [];
        this.taxCodes = (taxCodes.items ?? []).filter((t) => t.isActive);
        this.paymentTerms = (paymentTerms.items ?? []).filter((p) => p.isActive);
        this.salespeople = (salespeople.items ?? []).filter(
          (u) => u.status === 'ACTIVE',
        );
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load sales order lookups'));
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
    this.billingAddresses = [];
    this.shippingAddresses = [];
    this.formResetting = true;
    this.form.reset({
      customerId: '',
      notes: '',
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

  openEdit(order: SalesOrder): void {
    if (!this.canEditOrder(order)) {
      return;
    }
    this.editing = order;
    // Preserve the saved address snapshot on open — only an explicit customer
    // or address-dropdown change (via applyCustomerAddresses) should overwrite it.
    this.formResetting = true;
    this.form.reset({
      customerId: order.customerId,
      notes: order.notes ?? '',
      billingAddress: order.billingAddress ?? '',
      shippingAddress: order.shippingAddress ?? '',
      billingAddressId: '',
      shippingAddressId: '',
      paymentTermId: order.paymentTermId ?? '',
      salespersonId: order.salespersonId ?? '',
      deliveryDate: order.deliveryDate ? order.deliveryDate.slice(0, 10) : '',
    });
    this.formResetting = false;
    const customer = this.customers.find((c) => c.id === order.customerId);
    this.billingAddresses = this.activeAddressesOf(customer, 'BILLING');
    this.shippingAddresses = this.activeAddressesOf(customer, 'SHIPPING');
    const billingMatch = this.billingAddresses.find(
      (a) => this.addressLabel(a) === (order.billingAddress ?? ''),
    );

    const shippingMatch = this.shippingAddresses.find(
      (a) => this.addressLabel(a) === (order.shippingAddress ?? ''),
    );

    this.form.patchValue(
      {
        billingAddressId: billingMatch?.id ?? '',
        shippingAddressId: shippingMatch?.id ?? '',
      },
      { emitEvent: false },
    );
    this.lines.clear();
    for (const line of order.items ?? []) {
      this.lines.push(
        this.createLineGroup(
          line.productId,
          line.orderedQuantity,
          line.unitOfMeasureId ?? '',
          line.unitPrice,
          line.discountPercent ?? '',
          line.taxCodeId ?? '',
        ),
      );
      this.ensureProductUnitsLoaded(line.productId);
    }
    if (this.lines.length === 0) {
      this.lines.push(this.createLineGroup());
    }
    this.cdr.detectChanges();
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

  confirmTitle(type: SalesOrderAction): string {
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
      unitOfMeasureId: string;
      unitPrice: string;
      discountPercent: string;
      taxCodeId: string;
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
      if (!line.unitOfMeasureId) {
        this.toast.error('Select a unit of measure for every line.');
        return;
      }
    }

    const value = this.form.getRawValue();
    const notes = value.notes?.trim() || undefined;
    const billingAddress = value.billingAddress?.trim() || undefined;
    const shippingAddress = value.shippingAddress?.trim() || undefined;
    const paymentTermId = value.paymentTermId?.trim() || undefined;
    const salespersonId = value.salespersonId?.trim() || undefined;
    const deliveryDate = value.deliveryDate?.trim() || undefined;
    const items: SalesOrderItemInput[] = rawLines.map((line) => {
      const product = this.products.find((p) => p.id === line.productId)!;
      const discountPercent = line.discountPercent?.trim() || undefined;
      const taxCodeId = line.taxCodeId?.trim() || undefined;
      return {
        productId: line.productId,
        productSku: product.sku,
        productName: product.name,
        quantity: String(line.quantity).trim(),
        unitOfMeasureId: line.unitOfMeasureId,
        unitPrice: String(line.unitPrice).trim(),
        ...(discountPercent ? { discountPercent } : {}),
        ...(taxCodeId ? { taxCodeId } : {}),
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
          paymentTermId: paymentTermId ?? null,
          salespersonId: salespersonId ?? null,
          deliveryDate: deliveryDate ?? null,
          items,
        })
      : this.orders.create({
          customerId: value.customerId!,
          notes,
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
