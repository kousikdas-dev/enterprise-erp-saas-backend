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
  AbstractControl,
  FormBuilder,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { forkJoin, Observable } from 'rxjs';
import { AppPermissions } from '../../../core/permissions/permissions.constants';
import { PermissionService } from '../../../core/permissions/permission.service';
import { ProductService } from '../../inventory/products/product.service';
import { UnitService } from '../../inventory/units/unit.service';
import { WarehouseService } from '../../inventory/warehouses/warehouse.service';
import { Product, ProductUnit, Unit, Warehouse } from '../../inventory/models/inventory.models';
import { ToastService } from '../../../shared/toast/toast.service';
import { isPositiveDecimal } from '../../../shared/utils/decimal.util';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import {
  Bom,
  PRODUCTION_ORDER_PRIORITIES,
  PRODUCTION_ORDER_STATUSES,
  ProductionOrder,
  ProductionOrderPriority,
  ProductionOrderStatus,
} from '../models/production.models';
import { BomService } from '../boms/bom.service';
import { ProductionOrderService } from './production-order.service';

type PendingActionType = 'plan' | 'release' | 'start' | 'cancel' | 'close' | 'delete';

/** Rejects zero/negative quantities; empty values are left to Validators.required. */
function positiveQuantityValidator(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '').trim();
  if (!value) {
    return null;
  }
  return isPositiveDecimal(value) ? null : { positive: true };
}

@Component({
  selector: 'app-production-order-list',
  templateUrl: './production-order-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class ProductionOrderListComponent implements OnInit {
  @ViewChild('formModal') formModal!: TemplateRef<unknown>;
  @ViewChild('detailModal') detailModal!: TemplateRef<unknown>;
  @ViewChild('confirmModal') confirmModal!: TemplateRef<unknown>;

  private readonly orders = inject(ProductionOrderService);
  private readonly boms = inject(BomService);
  private readonly productService = inject(ProductService);
  private readonly unitService = inject(UnitService);
  private readonly warehouseService = inject(WarehouseService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canCreate = this.permissions.has(AppPermissions.PRODUCTION_ORDERS_CREATE);
  readonly canUpdate = this.permissions.has(AppPermissions.PRODUCTION_ORDERS_UPDATE);
  readonly canDelete = this.permissions.has(AppPermissions.PRODUCTION_ORDERS_DELETE);
  readonly canPlan = this.permissions.has(AppPermissions.PRODUCTION_ORDERS_PLAN);
  readonly canRelease = this.permissions.has(AppPermissions.PRODUCTION_ORDERS_RELEASE);
  readonly canStart = this.permissions.has(AppPermissions.PRODUCTION_ORDERS_START);
  readonly canComplete = this.permissions.has(AppPermissions.PRODUCTION_ORDERS_COMPLETE);
  readonly canCancel = this.permissions.has(AppPermissions.PRODUCTION_ORDERS_CANCEL);
  readonly canClose = this.permissions.has(AppPermissions.PRODUCTION_ORDERS_CLOSE);

  readonly statuses: readonly ProductionOrderStatus[] = PRODUCTION_ORDER_STATUSES;
  readonly priorities: readonly ProductionOrderPriority[] = PRODUCTION_ORDER_PRIORITIES;

  items: ProductionOrder[] = [];
  products: Product[] = [];
  warehouses: Warehouse[] = [];
  units: Unit[] = [];
  bomsForSelectedProduct: Bom[] = [];
  private readonly productUnitsByProduct = new Map<string, ProductUnit[]>();
  private readonly loadingProductUnits = new Set<string>();
  loading = false;
  error: string | null = null;

  // Production Orders can grow very large, so the list is server-paginated
  // (unlike the client-side-filtered BOM/Operations/Work Centre master
  // lists) — search/status/date filters are sent to the backend on load().
  search = '';
  filterStatus = '';
  filterDateFrom = '';
  filterDateTo = '';
  page = 1;
  pageSize = 20;
  total = 0;

  saving = false;
  actionBusy = false;
  editing: ProductionOrder | null = null;
  viewing: ProductionOrder | null = null;
  pendingAction: { type: PendingActionType; order: ProductionOrder } | null = null;
  private modalRef?: NgbModalRef;

  form = this.fb.group({
    productId: ['', Validators.required],
    bomId: ['', Validators.required],
    plannedQuantity: [
      '',
      [Validators.required, Validators.pattern(/^\d+(\.\d{1,6})?$/), positiveQuantityValidator],
    ],
    outputUnitOfMeasureId: ['', Validators.required],
    warehouseId: [''],
    priority: ['NORMAL' as ProductionOrderPriority, Validators.required],
    orderDate: ['', Validators.required],
    plannedStartDate: [''],
    plannedEndDate: [''],
    notes: ['', Validators.maxLength(500)],
  });

  ngOnInit(): void {
    this.form.get('productId')!.valueChanges.subscribe((productId) => {
      this.onProductChange(productId ?? '');
    });
    this.loadLookups();
    this.load();
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  /** Products eligible as a production order subject: active and inventory-tracked, mirroring BOM's rule. */
  get eligibleProducts(): Product[] {
    return this.products.filter((p) => p.isActive && p.trackInventory);
  }

  loadLookups(): void {
    forkJoin({
      products: this.productService.list(),
      units: this.unitService.list(),
      warehouses: this.warehouseService.list(),
    }).subscribe({
      next: ({ products, units, warehouses }) => {
        this.products = products.items ?? [];
        this.units = units.items ?? [];
        this.warehouses = warehouses.items ?? [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load product/UOM/warehouse lookups'));
        this.cdr.detectChanges();
      },
    });
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.orders
      .list({
        search: this.search.trim() || undefined,
        status: (this.filterStatus || undefined) as ProductionOrderStatus | undefined,
        dateFrom: this.filterDateFrom || undefined,
        dateTo: this.filterDateTo || undefined,
        page: this.page,
        pageSize: this.pageSize,
      })
      .subscribe({
        next: (res) => {
          this.items = res.items ?? [];
          this.total = res.total ?? 0;
          this.page = res.page ?? this.page;
          this.pageSize = res.pageSize ?? this.pageSize;
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.loading = false;
          this.error = apiErrorMessage(err, 'Failed to load production orders');
          this.cdr.detectChanges();
        },
      });
  }

  search$(): void {
    this.page = 1;
    this.load();
  }

  clearFilters(): void {
    this.search = '';
    this.filterStatus = '';
    this.filterDateFrom = '';
    this.filterDateTo = '';
    this.page = 1;
    this.load();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.page) {
      return;
    }
    this.page = page;
    this.load();
  }

  /** Selecting the product (create mode only) loads its ACTIVE BOMs and defaults Output UOM to its base unit. */
  private onProductChange(productId: string): void {
    if (this.editing) {
      return;
    }
    this.form.patchValue({ bomId: '', outputUnitOfMeasureId: '' }, { emitEvent: false });
    this.bomsForSelectedProduct = [];
    if (!productId) {
      return;
    }
    const product = this.products.find((p) => p.id === productId);
    if (product) {
      this.form.patchValue({ outputUnitOfMeasureId: product.unitOfMeasureId }, { emitEvent: false });
      this.ensureProductUnitsLoaded(productId);
    }
    this.boms.list(productId).subscribe({
      next: (res) => {
        this.bomsForSelectedProduct = (res.items ?? []).filter((b) => b.status === 'ACTIVE');
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load BOMs for this product'));
        this.cdr.detectChanges();
      },
    });
  }

  private ensureProductUnitsLoaded(productId: string): void {
    if (
      !productId ||
      this.productUnitsByProduct.has(productId) ||
      this.loadingProductUnits.has(productId)
    ) {
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

  /** UOM select options for the chosen product: base unit + active alternative units. */
  outputUomOptionsFor(productId: string): Array<{ id: string; label: string }> {
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

  warehouseLabel(id: string | null): string {
    if (!id) return '—';
    const w = this.warehouses.find((x) => x.id === id);
    return w ? `${w.code} — ${w.name}` : id.slice(0, 8);
  }

  statusBadgeClass(status: string): string {
    switch (status) {
      case 'DRAFT':
        return 'bg-secondary';
      case 'PLANNED':
        return 'bg-info text-dark';
      case 'RELEASED':
        return 'bg-primary';
      case 'IN_PROGRESS':
        return 'bg-warning text-dark';
      case 'COMPLETED':
        return 'bg-success';
      case 'CANCELLED':
        return 'bg-danger';
      case 'CLOSED':
        return 'bg-dark';
      default:
        return 'bg-secondary';
    }
  }

  /** Row/detail actions available for a given status — mirrors the task's explicit per-status action table. */
  canEdit(order: ProductionOrder): boolean {
    return this.canUpdate && order.status === 'DRAFT';
  }

  canRemove(order: ProductionOrder): boolean {
    return this.canDelete && order.status === 'DRAFT';
  }

  canPlanOrder(order: ProductionOrder): boolean {
    return this.canPlan && order.status === 'DRAFT';
  }

  canReleaseOrder(order: ProductionOrder): boolean {
    return this.canRelease && order.status === 'PLANNED';
  }

  canStartOrder(order: ProductionOrder): boolean {
    return this.canStart && order.status === 'RELEASED';
  }

  /** Always false today: completion requires Production Receipt, which this phase does not implement. */
  canCompleteOrder(order: ProductionOrder): boolean {
    return this.canComplete && order.status === 'IN_PROGRESS';
  }

  canCancelOrder(order: ProductionOrder): boolean {
    return this.canCancel && ['DRAFT', 'PLANNED', 'RELEASED'].includes(order.status);
  }

  canCloseOrder(order: ProductionOrder): boolean {
    return this.canClose && ['COMPLETED', 'CANCELLED'].includes(order.status);
  }

  openCreate(): void {
    if (!this.canCreate) {
      return;
    }
    this.editing = null;
    this.bomsForSelectedProduct = [];
    this.form.reset({
      productId: '',
      bomId: '',
      plannedQuantity: '',
      outputUnitOfMeasureId: '',
      warehouseId: '',
      priority: 'NORMAL',
      orderDate: new Date().toISOString().slice(0, 10),
      plannedStartDate: '',
      plannedEndDate: '',
      notes: '',
    });
    this.modalRef = this.modal.open(this.formModal, { centered: true, size: 'lg' });
  }

  openEdit(order: ProductionOrder): void {
    if (!this.canEdit(order)) {
      return;
    }
    this.editing = order;
    this.bomsForSelectedProduct = [];
    this.ensureProductUnitsLoaded(order.productId);
    this.boms.list(order.productId).subscribe({
      next: (res) => {
        this.bomsForSelectedProduct = (res.items ?? []).filter((b) => b.status === 'ACTIVE');
        this.cdr.detectChanges();
      },
    });
    this.form.reset({
      productId: order.productId,
      bomId: order.bomId,
      plannedQuantity: order.plannedQuantity,
      outputUnitOfMeasureId: order.outputUnitOfMeasureId,
      warehouseId: order.warehouseId ?? '',
      priority: order.priority as ProductionOrderPriority,
      orderDate: order.orderDate.slice(0, 10),
      plannedStartDate: order.plannedStartDate ? order.plannedStartDate.slice(0, 10) : '',
      plannedEndDate: order.plannedEndDate ? order.plannedEndDate.slice(0, 10) : '',
      notes: order.notes ?? '',
    });
    this.modalRef = this.modal.open(this.formModal, { centered: true, size: 'lg' });
  }

  openDetail(order: ProductionOrder): void {
    this.viewing = order;
    this.modal.open(this.detailModal, { centered: true, size: 'lg' });
    this.orders.getById(order.id).subscribe({
      next: (detail) => {
        this.viewing = detail;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load production order details'));
        this.cdr.detectChanges();
      },
    });
  }

  askPlan(order: ProductionOrder): void {
    this.pendingAction = { type: 'plan', order };
    this.modal.open(this.confirmModal, { centered: true });
  }

  askRelease(order: ProductionOrder): void {
    this.pendingAction = { type: 'release', order };
    this.modal.open(this.confirmModal, { centered: true });
  }

  askStart(order: ProductionOrder): void {
    this.pendingAction = { type: 'start', order };
    this.modal.open(this.confirmModal, { centered: true });
  }

  askCancel(order: ProductionOrder): void {
    this.pendingAction = { type: 'cancel', order };
    this.modal.open(this.confirmModal, { centered: true });
  }

  askClose(order: ProductionOrder): void {
    this.pendingAction = { type: 'close', order };
    this.modal.open(this.confirmModal, { centered: true });
  }

  askDelete(order: ProductionOrder): void {
    this.pendingAction = { type: 'delete', order };
    this.modal.open(this.confirmModal, { centered: true });
  }

  confirmActionLabel(type: PendingActionType | undefined): string {
    switch (type) {
      case 'plan':
        return 'Plan';
      case 'release':
        return 'Release';
      case 'start':
        return 'Start';
      case 'cancel':
        return 'Cancel Order';
      case 'close':
        return 'Close';
      case 'delete':
        return 'Delete';
      default:
        return 'Confirm';
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
      type === 'plan'
        ? this.orders.plan(order.id)
        : type === 'release'
          ? this.orders.release(order.id)
          : type === 'start'
            ? this.orders.start(order.id)
            : type === 'close'
              ? this.orders.close(order.id)
              : type === 'delete'
                ? this.orders.remove(order.id)
                : this.orders.cancel(order.id);

    const successMessage: Record<PendingActionType, string> = {
      plan: 'Production order planned',
      release: 'Production order released',
      start: 'Production order started',
      cancel: 'Production order cancelled',
      close: 'Production order closed',
      delete: 'Production order deleted',
    };

    request$.subscribe({
      next: () => {
        this.actionBusy = false;
        modal.close();
        this.pendingAction = null;
        this.toast.success(successMessage[type]);
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
    const value = this.form.getRawValue();
    if (
      value.plannedStartDate &&
      value.plannedEndDate &&
      value.plannedEndDate < value.plannedStartDate
    ) {
      this.toast.error('Planned End cannot be before Planned Start.');
      return;
    }

    const payload = {
      productId: value.productId!,
      bomId: value.bomId!,
      plannedQuantity: String(value.plannedQuantity).trim(),
      outputUnitOfMeasureId: value.outputUnitOfMeasureId!,
      warehouseId: value.warehouseId?.trim() || undefined,
      priority: value.priority ?? undefined,
      orderDate: value.orderDate!,
      plannedStartDate: value.plannedStartDate?.trim() || undefined,
      plannedEndDate: value.plannedEndDate?.trim() || undefined,
      notes: value.notes?.trim() || undefined,
    };

    this.saving = true;
    this.cdr.detectChanges();

    const request$ = this.editing
      ? this.orders.update(this.editing.id, payload)
      : this.orders.create(payload);

    request$.subscribe({
      next: (result) => {
        this.saving = false;
        this.modalRef?.close();
        this.toast.success(
          this.editing
            ? 'Production order updated'
            : `Production Order ${result.orderNumber} created successfully.`,
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
