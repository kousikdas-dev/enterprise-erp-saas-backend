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
import { UnitService } from '../../inventory/units/unit.service';
import { WarehouseService } from '../../inventory/warehouses/warehouse.service';
import { Product, ProductUnit, Unit, Warehouse } from '../../inventory/models/inventory.models';
import { User } from '../../administration/models/administration.models';
import { UserService } from '../../administration/users/user.service';
import { MasterDataOption } from '../../../shared/master-data/master-data.models';
import { MasterDataService } from '../../../shared/master-data/master-data.service';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  isPositiveDecimal,
  multiplyDecimals,
  percentageOfDecimal,
  subtractDecimals,
  sumDecimals,
  formatQuantity,
} from '../../../shared/utils/decimal.util';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import {
  PurchaseOrder,
  PurchaseOrderLineInput,
  Supplier,
} from '../models/purchase.models';
import { SupplierService } from '../suppliers/supplier.service';
import { PurchaseOrderService } from './purchase-order.service';
import { TaxCode } from '../../accounting/models/accounting.models';
import { TaxCodeService } from '../../accounting/tax-codes/tax-code.service';

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
  private readonly unitService = inject(UnitService);
  private readonly taxCodeService = inject(TaxCodeService);
  private readonly warehouseService = inject(WarehouseService);
  private readonly userService = inject(UserService);
  private readonly masterData = inject(MasterDataService);
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
  units: Unit[] = [];
  taxCodes: TaxCode[] = [];
  warehouses: Warehouse[] = [];
  buyers: User[] = [];
  paymentTerms: MasterDataOption[] = [];
  private readonly productUnitsByProduct = new Map<string, ProductUnit[]>();
  private readonly loadingProductUnits = new Set<string>();
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
    supplierReference: ['', Validators.maxLength(120)],
    expectedDeliveryDate: [''],
    buyerId: [''],
    paymentTermId: [''],
    warehouseId: [''],
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
    return this.items.filter(
      (o) =>
        o.id.toLowerCase().includes(q) ||
        o.poNumber.toLowerCase().includes(q) ||
        o.status.toLowerCase().includes(q) ||
        o.supplierName.toLowerCase().includes(q) ||
        (o.notes ?? '').toLowerCase().includes(q),
    );
  }

  createLineGroup(
    productId = '',
    quantity = '',
    unitOfMeasureId = '',
    unitCost = '',
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
      unitCost: [
        unitCost,
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

  /** Selecting a product defaults its UOM to the base unit and its cost from Product.costPrice (falling back to sellingPrice). */
  private onLineProductChange(group: FormGroup, productId: string): void {
    const product = this.products.find((p) => p.id === productId);
    if (!product) {
      return;
    }
    group.patchValue(
      {
        unitOfMeasureId: product.unitOfMeasureId,
        unitCost: product.costPrice ?? product.sellingPrice,
      },
      { emitEvent: false },
    );
    this.ensureProductUnitsLoaded(productId);
  }

  /** Selecting an alternative UOM defaults cost from that ProductUnit.costPrice (never derived from conversionFactor). */
  private onLineUomChange(group: FormGroup, unitOfMeasureId: string): void {
    const productId = group.get('productId')!.value as string;
    const product = this.products.find((p) => p.id === productId);
    if (!product || !unitOfMeasureId) {
      return;
    }
    if (unitOfMeasureId === product.unitOfMeasureId) {
      group
        .get('unitCost')!
        .setValue(product.costPrice ?? product.sellingPrice, { emitEvent: false });
      return;
    }
    const alternatives = this.productUnitsByProduct.get(productId) ?? [];
    const match = alternatives.find((u) => u.unitOfMeasureId === unitOfMeasureId);
    if (match) {
      group
        .get('unitCost')!
        .setValue(match.costPrice ?? match.sellingPrice, { emitEvent: false });
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

  supplierLabel(id: string): string {
    const s = this.suppliers.find((x) => x.id === id);
    return s ? `${s.code} — ${s.name}` : id.slice(0, 8);
  }

  buyerLabel(id: string | null): string {
    if (!id) {
      return '—';
    }
    const u = this.buyers.find((x) => x.id === id);
    return u ? `${u.firstName} ${u.lastName}`.trim() || u.email : id.slice(0, 8);
  }

  warehouseLabel(id: string | null): string {
    if (!id) {
      return '—';
    }
    const w = this.warehouses.find((x) => x.id === id);
    return w ? `${w.code} — ${w.name}` : id.slice(0, 8);
  }

  paymentTermLabel(id: string | null): string {
    if (!id) {
      return '—';
    }
    const p = this.paymentTerms.find((x) => x.id === id);
    return p ? p.name : id.slice(0, 8);
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

  remainingQty(item: { quantity: string; receivedQuantity: string }): string {
    return formatQuantity(subtractDecimals(item.quantity, item.receivedQuantity));
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
   * each tax component independently → taxAmount → lineTotal. Display-only —
   * the saved purchase order's response from the server is always authoritative.
   */
  private computeLineAmounts(line: {
    quantity: string;
    unitCost: string;
    discountPercent: string;
    taxCodeId: string;
  }): {
    gross: string;
    discountAmount: string;
    lineSubtotal: string;
    taxAmount: string;
    lineTotal: string;
  } | null {
    if (!isPositiveDecimal(line.quantity) || !isPositiveDecimal(line.unitCost)) {
      return null;
    }
    const gross = multiplyDecimals(line.quantity, line.unitCost, 4);
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

  linePreview(line: {
    quantity: string;
    unitCost: string;
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
        unitCost: string;
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
      suppliers: this.supplierService.list(),
      products: this.productService.list(),
      units: this.unitService.list(),
      taxCodes: this.taxCodeService.list(),
      warehouses: this.warehouseService.list(),
      buyers: this.userService.list(),
      paymentTerms: this.masterData.paymentTerms(),
    }).subscribe({
      next: ({ suppliers, products, units, taxCodes, warehouses, buyers, paymentTerms }) => {
        this.suppliers = suppliers.items ?? [];
        this.products = products.items ?? [];
        this.units = units.items ?? [];
        this.taxCodes = (taxCodes.items ?? []).filter((t) => t.isActive);
        this.warehouses = (warehouses.items ?? []).filter((w) => w.isActive);
        this.buyers = buyers.items ?? [];
        this.paymentTerms = paymentTerms.items ?? [];
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
    this.form.reset({
      supplierId: '',
      supplierReference: '',
      expectedDeliveryDate: '',
      buyerId: '',
      paymentTermId: '',
      warehouseId: '',
      notes: '',
    });
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
      supplierReference: order.supplierReference ?? '',
      expectedDeliveryDate: order.expectedDeliveryDate
        ? order.expectedDeliveryDate.slice(0, 10)
        : '',
      buyerId: order.buyerId ?? '',
      paymentTermId: order.paymentTermId ?? '',
      warehouseId: order.warehouseId ?? '',
      notes: order.notes ?? '',
    });
    this.lines.clear();
    for (const line of order.items ?? []) {
      this.lines.push(
        this.createLineGroup(
          line.productId,
          line.quantity,
          line.unitOfMeasureId ?? '',
          line.unitCost,
          line.discountPercent ?? '',
          line.taxCodeId ?? '',
        ),
      );
      this.ensureProductUnitsLoaded(line.productId);
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
      unitOfMeasureId: string;
      unitCost: string;
      discountPercent: string;
      taxCodeId: string;
    }>;
    for (const line of rawLines) {
      if (!isPositiveDecimal(line.quantity) || !isPositiveDecimal(line.unitCost)) {
        this.toast.error('Each line needs a positive quantity and unit cost.');
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
    const supplierReference = value.supplierReference?.trim() || undefined;
    const expectedDeliveryDate = value.expectedDeliveryDate?.trim() || undefined;
    const buyerId = value.buyerId?.trim() || undefined;
    const paymentTermId = value.paymentTermId?.trim() || undefined;
    const warehouseId = value.warehouseId?.trim() || undefined;
    const items: PurchaseOrderLineInput[] = rawLines.map((line) => {
      const product = this.products.find((p) => p.id === line.productId)!;
      const discountPercent = line.discountPercent?.trim() || undefined;
      const taxCodeId = line.taxCodeId?.trim() || undefined;
      return {
        productId: line.productId,
        productSku: product.sku,
        productName: product.name,
        quantity: String(line.quantity).trim(),
        unitOfMeasureId: line.unitOfMeasureId,
        unitCost: String(line.unitCost).trim(),
        ...(discountPercent ? { discountPercent } : {}),
        ...(taxCodeId ? { taxCodeId } : {}),
      };
    });

    this.saving = true;
    this.cdr.detectChanges();

    const request$ = this.editing
      ? this.orders.update(this.editing.id, {
          supplierId: value.supplierId!,
          supplierReference,
          expectedDeliveryDate,
          buyerId,
          paymentTermId,
          warehouseId,
          notes,
          items,
        })
      : this.orders.create({
          supplierId: value.supplierId!,
          supplierReference,
          expectedDeliveryDate,
          buyerId,
          paymentTermId,
          warehouseId,
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
