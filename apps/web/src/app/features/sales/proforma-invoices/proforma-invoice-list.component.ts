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
  ProformaInvoice,
  ProformaInvoiceItemInput,
} from '../models/sales.models';
import { CustomerService } from '../customers/customer.service';
import { ProformaInvoiceService } from './proforma-invoice.service';
import { proformaSourceLabel } from './proforma-source.util';
import { TaxCode } from '../../accounting/models/accounting.models';
import { TaxCodeService } from '../../accounting/tax-codes/tax-code.service';

type ProformaInvoiceAction = 'send' | 'cancel' | 'invoice' | 'convert';

@Component({
  selector: 'app-proforma-invoice-list',
  templateUrl: './proforma-invoice-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class ProformaInvoiceListComponent implements OnInit {
  @ViewChild('formModal') formModal!: TemplateRef<unknown>;
  @ViewChild('detailModal') detailModal!: TemplateRef<unknown>;
  @ViewChild('actionModal') actionModal!: TemplateRef<unknown>;

  private readonly proformas = inject(ProformaInvoiceService);
  private readonly productService = inject(ProductService);
  private readonly unitService = inject(UnitService);
  private readonly taxCodeService = inject(TaxCodeService);
  private readonly customerService = inject(CustomerService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canUpdate = this.permissions.has(AppPermissions.PROFORMA_INVOICES_UPDATE);
  readonly canSend = this.permissions.has(AppPermissions.PROFORMA_INVOICES_SEND);
  readonly canCancel = this.permissions.has(AppPermissions.PROFORMA_INVOICES_CANCEL);
  readonly canCreateInvoice = this.permissions.has(AppPermissions.SALES_INVOICES_CREATE);
  readonly canConvertToOrder = this.permissions.has(AppPermissions.SALES_ORDERS_CREATE);

  items: ProformaInvoice[] = [];
  products: Product[] = [];
  units: Unit[] = [];
  taxCodes: TaxCode[] = [];
  customers: Customer[] = [];
  billingAddresses: CustomerAddress[] = [];
  shippingAddresses: CustomerAddress[] = [];
  private readonly productUnitsByProduct = new Map<string, ProductUnit[]>();
  private readonly loadingProductUnits = new Set<string>();
  loading = false;
  error: string | null = null;
  filter = '';
  saving = false;
  actionBusy = false;
  editing: ProformaInvoice | null = null;
  viewing: ProformaInvoice | null = null;
  pendingAction: { type: ProformaInvoiceAction; proforma: ProformaInvoice } | null = null;
  private modalRef?: NgbModalRef;
  private formResetting = false;

  form = this.fb.group({
    notes: ['', Validators.maxLength(500)],
    billingAddress: ['', Validators.maxLength(500)],
    shippingAddress: ['', Validators.maxLength(500)],
    billingAddressId: [''],
    shippingAddressId: [''],
    items: this.fb.array([this.createLineGroup()]),
  });

  ngOnInit(): void {
    this.loadLookups();
    this.load();

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

  get filtered(): ProformaInvoice[] {
    const q = this.filter.trim().toLowerCase();
    if (!q) {
      return this.items;
    }
    return this.items.filter(
      (p) =>
        p.documentNumber.toLowerCase().includes(q) ||
        p.status.toLowerCase().includes(q) ||
        p.customerName.toLowerCase().includes(q) ||
        p.sourceType.toLowerCase().includes(q),
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

  productLabel(id: string): string {
    const p = this.products.find((x) => x.id === id);
    return p ? `${p.sku} — ${p.name}` : id.slice(0, 8);
  }

  sourceLabel(p: Pick<ProformaInvoice, 'sourceType'>): string {
    return proformaSourceLabel(p.sourceType);
  }

  canEditProforma(p: ProformaInvoice): boolean {
    return this.canUpdate && p.status === 'DRAFT';
  }

  canSendProforma(p: ProformaInvoice): boolean {
    return this.canSend && p.status === 'DRAFT';
  }

  canCancelProforma(p: ProformaInvoice): boolean {
    return this.canCancel && (p.status === 'DRAFT' || p.status === 'ISSUED');
  }

  canCreateInvoiceFor(p: ProformaInvoice): boolean {
    return this.canCreateInvoice && p.status === 'ISSUED';
  }

  canConvertProforma(p: ProformaInvoice): boolean {
    return this.canConvertToOrder && p.status === 'ISSUED';
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
   * The saved proforma invoice's response from the server is always authoritative.
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
      products: this.productService.list(),
      units: this.unitService.list(),
      taxCodes: this.taxCodeService.list(),
      customers: this.customerService.list(),
    }).subscribe({
      next: ({ products, units, taxCodes, customers }) => {
        this.products = products.items ?? [];
        this.units = units.items ?? [];
        this.taxCodes = (taxCodes.items ?? []).filter((t) => t.isActive);
        this.customers = customers.items ?? [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load proforma invoice lookups'));
        this.cdr.detectChanges();
      },
    });
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.proformas.list().subscribe({
      next: (res) => {
        this.items = res.items ?? [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load proforma invoices');
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

  openEdit(item: ProformaInvoice): void {
    if (!this.canEditProforma(item)) {
      return;
    }
    this.editing = item;
    // Preserve the saved address snapshot on open — only an explicit
    // address-dropdown change should overwrite it. Proforma's customer is
    // fixed (inherited from its source document), so unlike Quotation/Sales
    // Order there is no customerId control to react to here.
    this.formResetting = true;
    this.form.reset({
      notes: item.notes ?? '',
      billingAddress: item.billingAddress ?? '',
      shippingAddress: item.shippingAddress ?? '',
      billingAddressId: '',
      shippingAddressId: '',
    });
    this.formResetting = false;
    const customer = this.customers.find((c) => c.id === item.customerId);
    this.billingAddresses = this.activeAddressesOf(customer, 'BILLING');
    this.shippingAddresses = this.activeAddressesOf(customer, 'SHIPPING');
    const billingMatch = this.billingAddresses.find(
      (a) => this.addressLabel(a) === (item.billingAddress ?? ''),
    );
    const shippingMatch = this.shippingAddresses.find(
      (a) => this.addressLabel(a) === (item.shippingAddress ?? ''),
    );
    this.form.patchValue(
      {
        billingAddressId: billingMatch?.id ?? '',
        shippingAddressId: shippingMatch?.id ?? '',
      },
      { emitEvent: false },
    );
    this.lines.clear();
    for (const line of item.items ?? []) {
      this.lines.push(
        this.createLineGroup(
          line.productId,
          line.quantity,
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

  openDetail(item: ProformaInvoice): void {
    this.viewing = item;
    this.modal.open(this.detailModal, { centered: true, size: 'lg' });
    this.proformas.getById(item.id).subscribe({
      next: (detail) => {
        this.viewing = detail;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load proforma details'));
        this.cdr.detectChanges();
      },
    });
  }

  askAction(type: ProformaInvoiceAction, proforma: ProformaInvoice): void {
    this.pendingAction = { type, proforma };
    this.modal.open(this.actionModal, { centered: true });
  }

  actionLabel(type: ProformaInvoiceAction): string {
    switch (type) {
      case 'send':
        return 'Send proforma invoice';
      case 'cancel':
        return 'Cancel proforma invoice';
      case 'invoice':
        return 'Create sales invoice';
      case 'convert':
        return 'Convert to sales order';
    }
  }

  runPendingAction(modal: { close: () => void }): void {
    if (!this.pendingAction || this.actionBusy) {
      return;
    }
    const { type, proforma } = this.pendingAction;
    this.actionBusy = true;
    this.cdr.detectChanges();

    const request$: Observable<unknown> =
      type === 'send'
        ? this.proformas.send(proforma.id)
        : type === 'cancel'
          ? this.proformas.cancel(proforma.id)
          : type === 'invoice'
            ? this.proformas.createInvoice(proforma.id)
            : this.proformas.convertToOrder(proforma.id);

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
    if (!this.editing || this.form.invalid || this.saving) {
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
    const items: ProformaInvoiceItemInput[] = rawLines.map((line) => {
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

    this.proformas
      .update(this.editing.id, {
        notes: notes ?? null,
        billingAddress: billingAddress ?? null,
        shippingAddress: shippingAddress ?? null,
        items,
      })
      .subscribe({
        next: () => {
          this.saving = false;
          this.modalRef?.close();
          this.toast.success('Proforma invoice updated');
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
