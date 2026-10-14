import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AppPermissions } from '../../../core/permissions/permissions.constants';
import { PermissionService } from '../../../core/permissions/permission.service';
import { Product, ProductUnit, Unit, Warehouse } from '../../inventory/models/inventory.models';
import { ProductService } from '../../inventory/products/product.service';
import { UnitService } from '../../inventory/units/unit.service';
import { WarehouseService } from '../../inventory/warehouses/warehouse.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { isPositiveDecimal } from '../../../shared/utils/decimal.util';
import {
  Bom,
  Operation,
  PRODUCTION_ORDER_PRIORITIES,
  ProductionOrder,
  ProductionOrderItemLineInput,
  ProductionOrderPriority,
  ProductionOrderStatus,
  WorkCentre,
  WorkOrder,
} from '../models/production.models';
import { BomService } from '../boms/bom.service';
import { OperationService } from '../operations/operation.service';
import { WorkCentreService } from '../work-centres/work-centre.service';
import { WorkOrderService } from '../work-orders/work-order.service';
import { ProductionOrderService } from './production-order.service';

type PendingActionType = 'plan' | 'release' | 'start' | 'cancel' | 'close';
type WorkOrderActionType = 'start' | 'block' | 'unblock' | 'complete' | 'cancel';

/** The main Draft→Planned→Released→In Progress→Completed path; Cancelled is a side branch handled separately. */
const STATUS_STEPS: readonly ProductionOrderStatus[] = [
  'DRAFT',
  'PLANNED',
  'RELEASED',
  'IN_PROGRESS',
  'COMPLETED',
];

function positiveQuantityValidator(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '').trim();
  if (!value) {
    return null;
  }
  return isPositiveDecimal(value) ? null : { positive: true };
}

@Component({
  selector: 'app-production-order-detail',
  templateUrl: './production-order-detail.component.html',
  styleUrls: ['./production-order-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class ProductionOrderDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly orders = inject(ProductionOrderService);
  private readonly boms = inject(BomService);
  private readonly productService = inject(ProductService);
  private readonly unitService = inject(UnitService);
  private readonly warehouseService = inject(WarehouseService);
  private readonly operationService = inject(OperationService);
  private readonly workCentreService = inject(WorkCentreService);
  private readonly workOrderService = inject(WorkOrderService);
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canCreate = this.permissions.has(AppPermissions.PRODUCTION_ORDERS_CREATE);
  readonly canUpdate = this.permissions.has(AppPermissions.PRODUCTION_ORDERS_UPDATE);
  readonly canPlan = this.permissions.has(AppPermissions.PRODUCTION_ORDERS_PLAN);
  readonly canRelease = this.permissions.has(AppPermissions.PRODUCTION_ORDERS_RELEASE);
  readonly canStart = this.permissions.has(AppPermissions.PRODUCTION_ORDERS_START);
  readonly canCancel = this.permissions.has(AppPermissions.PRODUCTION_ORDERS_CANCEL);
  readonly canClose = this.permissions.has(AppPermissions.PRODUCTION_ORDERS_CLOSE);

  readonly canCreateWorkOrder = this.permissions.has(AppPermissions.PRODUCTION_WORK_ORDERS_CREATE);
  readonly canDeleteWorkOrder = this.permissions.has(AppPermissions.PRODUCTION_WORK_ORDERS_DELETE);
  readonly canStartWorkOrder = this.permissions.has(AppPermissions.PRODUCTION_WORK_ORDERS_START);
  readonly canBlockWorkOrder = this.permissions.has(AppPermissions.PRODUCTION_WORK_ORDERS_BLOCK);
  readonly canUnblockWorkOrder = this.permissions.has(AppPermissions.PRODUCTION_WORK_ORDERS_UNBLOCK);
  readonly canCompleteWorkOrder = this.permissions.has(AppPermissions.PRODUCTION_WORK_ORDERS_COMPLETE);
  readonly canCancelWorkOrder = this.permissions.has(AppPermissions.PRODUCTION_WORK_ORDERS_CANCEL);

  readonly priorities: readonly ProductionOrderPriority[] = PRODUCTION_ORDER_PRIORITIES;
  readonly statusSteps = STATUS_STEPS;

  isNew = true;
  order: ProductionOrder | null = null;
  bomsForSelectedProduct: Bom[] = [];
  activeTab: 'components' | 'workOrders' | 'misc' = 'components';

  products: Product[] = [];
  warehouses: Warehouse[] = [];
  units: Unit[] = [];
  private readonly productUnitsByProduct = new Map<string, ProductUnit[]>();

  operations: Operation[] = [];
  workCentres: WorkCentre[] = [];
  workOrders: WorkOrder[] = [];
  workOrderForm = this.fb.group({
    operationId: ['', Validators.required],
    workCentreId: ['', Validators.required],
    plannedDurationMinutes: ['', [Validators.required, Validators.min(1)]],
    scheduledStartDate: [''],
    scheduledEndDate: [''],
  });
  workOrderSaving = false;
  workOrderActionBusyId: string | null = null;

  loading = false;
  saving = false;
  actionBusy = false;
  error: string | null = null;

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
    items: this.fb.array<FormGroup>([]),
  });

  get lines(): FormArray<FormGroup> {
    return this.form.get('items') as FormArray<FormGroup>;
  }

  get eligibleProducts(): Product[] {
    return this.products.filter((p) => p.isActive && p.trackInventory);
  }

  /** Form fields stay editable while creating, or editing a still-DRAFT order. */
  get isEditable(): boolean {
    return this.isNew || this.order?.status === 'DRAFT';
  }

  ngOnInit(): void {
    this.form.get('productId')!.valueChanges.subscribe((productId) => {
      if (this.isEditable) {
        this.onProductChange(productId ?? '');
      }
    });

    const id = this.route.snapshot.paramMap.get('id');
    this.isNew = !id || id === 'new';
    this.loadLookups();
    if (!this.isNew && id) {
      this.loadOrder(id);
    } else {
      this.form.patchValue({ orderDate: new Date().toISOString().slice(0, 10) });
    }
  }

  loadLookups(): void {
    forkJoin({
      products: this.productService.list(),
      units: this.unitService.list(),
      warehouses: this.warehouseService.list(),
      operations: this.operationService.list(),
      workCentres: this.workCentreService.list(),
    }).subscribe({
      next: ({ products, units, warehouses, operations, workCentres }) => {
        this.products = products.items ?? [];
        this.units = units.items ?? [];
        this.warehouses = warehouses.items ?? [];
        this.operations = operations.items ?? [];
        this.workCentres = workCentres.items ?? [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load product/UOM/warehouse lookups'));
        this.cdr.detectChanges();
      },
    });
  }

  private loadWorkOrders(productionOrderId: string): void {
    this.workOrderService.list({ productionOrderId }).subscribe({
      next: (res) => {
        this.workOrders = res.items ?? [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load work orders'));
        this.cdr.detectChanges();
      },
    });
  }

  loadOrder(id: string): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.orders.getById(id).subscribe({
      next: (order) => {
        this.order = order;
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
        this.ensureProductUnitsLoaded(order.productId);
        this.boms.list(order.productId).subscribe((res) => {
          this.bomsForSelectedProduct = (res.items ?? []).filter(
            (b) => b.status === 'ACTIVE' || b.id === order.bomId,
          );
          this.cdr.detectChanges();
        });

        // Components reflect this order's own persisted items, not a live
        // recompute from the BOM — they're independently editable per order.
        this.lines.clear();
        for (const item of order.items ?? []) {
          this.lines.push(
            this.createLineGroup(
              item.componentProductId,
              item.quantity,
              item.unitOfMeasureId,
              item.sequence,
            ),
          );
          this.ensureProductUnitsLoaded(item.componentProductId);
        }

        this.loadWorkOrders(order.id);
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load production order');
        this.cdr.detectChanges();
      },
    });
  }

  private onProductChange(productId: string): void {
    this.form.patchValue({ bomId: '', outputUnitOfMeasureId: '' }, { emitEvent: false });
    this.bomsForSelectedProduct = [];
    this.lines.clear();
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

  /** Selecting a BOM (re)populates Components from it, scaled to the current quantity — a starting point the user can then freely add/remove/edit from. */
  onBomChange(bomId: string): void {
    if (!bomId) {
      return;
    }
    this.boms.getById(bomId).subscribe({
      next: (bom) => {
        const qty = Number(this.form.value.plannedQuantity) || 0;
        const scale = qty > 0 ? qty / Number(bom.bomQuantity || 1) : 0;
        this.lines.clear();
        bom.items.forEach((item, index) => {
          this.lines.push(
            this.createLineGroup(
              item.componentProductId,
              (Number(item.quantity) * scale).toFixed(6).replace(/\.?0+$/, '') || '0',
              item.unitOfMeasureId,
              index + 1,
            ),
          );
          this.ensureProductUnitsLoaded(item.componentProductId);
        });
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load BOM components'));
        this.cdr.detectChanges();
      },
    });
  }

  createLineGroup(
    componentProductId = '',
    quantity = '',
    unitOfMeasureId = '',
    sequence = 1,
  ): FormGroup {
    const group = this.fb.group({
      componentProductId: [componentProductId, Validators.required],
      quantity: [
        quantity,
        [Validators.required, Validators.pattern(/^\d+(\.\d{1,6})?$/), positiveQuantityValidator],
      ],
      unitOfMeasureId: [unitOfMeasureId, Validators.required],
      sequence: [sequence, [Validators.required, Validators.min(1)]],
    });

    group.get('componentProductId')!.valueChanges.subscribe((productId) => {
      this.onLineProductChange(group, productId ?? '');
    });

    return group;
  }

  private onLineProductChange(group: FormGroup, productId: string): void {
    const product = this.products.find((p) => p.id === productId);
    if (!product) {
      return;
    }
    group.patchValue({ unitOfMeasureId: product.unitOfMeasureId }, { emitEvent: false });
    this.ensureProductUnitsLoaded(productId);
  }

  addLine(): void {
    this.lines.push(this.createLineGroup(undefined, undefined, undefined, this.lines.length + 1));
  }

  removeLine(index: number): void {
    this.lines.removeAt(index);
  }

  componentUomOptionsFor(productId: string): Array<{ id: string; label: string }> {
    return this.uomOptionsForProduct(productId);
  }

  private ensureProductUnitsLoaded(productId: string): void {
    if (!productId || this.productUnitsByProduct.has(productId)) {
      return;
    }
    this.productService.listUnits(productId).subscribe({
      next: (res) => this.productUnitsByProduct.set(productId, res.items ?? []),
      error: () => undefined,
    });
  }

  outputUomOptionsFor(productId: string): Array<{ id: string; label: string }> {
    return this.uomOptionsForProduct(productId);
  }

  private uomOptionsForProduct(productId: string): Array<{ id: string; label: string }> {
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
    if (!id) return 'Not specified';
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

  get canPlanOrder(): boolean {
    return !!this.order && this.canPlan && this.order.status === 'DRAFT';
  }

  get canReleaseOrder(): boolean {
    return !!this.order && this.canRelease && this.order.status === 'PLANNED';
  }

  get canStartOrder(): boolean {
    return !!this.order && this.canStart && this.order.status === 'RELEASED';
  }

  get canCancelOrder(): boolean {
    return (
      !!this.order &&
      this.canCancel &&
      ['DRAFT', 'PLANNED', 'RELEASED'].includes(this.order.status)
    );
  }

  get canCloseOrder(): boolean {
    return (
      !!this.order && this.canClose && ['COMPLETED', 'CANCELLED'].includes(this.order.status)
    );
  }

  runAction(type: PendingActionType): void {
    if (!this.order || this.actionBusy) {
      return;
    }
    const id = this.order.id;
    this.actionBusy = true;
    this.cdr.detectChanges();

    const request$ =
      type === 'plan'
        ? this.orders.plan(id)
        : type === 'release'
          ? this.orders.release(id)
          : type === 'start'
            ? this.orders.start(id)
            : type === 'close'
              ? this.orders.close(id)
              : this.orders.cancel(id);

    const successMessage: Record<PendingActionType, string> = {
      plan: 'Production order confirmed',
      release: 'Production order released',
      start: 'Production order started',
      cancel: 'Production order cancelled',
      close: 'Production order closed',
    };

    request$.subscribe({
      next: (updated) => {
        this.actionBusy = false;
        this.order = updated;
        this.toast.success(successMessage[type]);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.actionBusy = false;
        this.toast.error(apiErrorMessage(err, 'Action failed'));
        this.cdr.detectChanges();
      },
    });
  }

  operationLabel(id: string): string {
    const o = this.operations.find((x) => x.id === id);
    return o ? `${o.code} — ${o.name}` : id.slice(0, 8);
  }

  workCentreLabel(id: string): string {
    const w = this.workCentres.find((x) => x.id === id);
    return w ? `${w.code} — ${w.name}` : id.slice(0, 8);
  }

  workOrderStatusBadgeClass(status: string): string {
    switch (status) {
      case 'PENDING':
        return 'bg-secondary';
      case 'IN_PROGRESS':
        return 'bg-warning text-dark';
      case 'BLOCKED':
        return 'bg-danger';
      case 'DONE':
        return 'bg-success';
      case 'CANCELLED':
        return 'bg-dark';
      default:
        return 'bg-secondary';
    }
  }

  addWorkOrder(): void {
    if (!this.order || this.workOrderForm.invalid || this.workOrderSaving) {
      this.workOrderForm.markAllAsTouched();
      return;
    }
    const value = this.workOrderForm.getRawValue();
    if (
      value.scheduledStartDate &&
      value.scheduledEndDate &&
      value.scheduledEndDate < value.scheduledStartDate
    ) {
      this.toast.error('Scheduled End cannot be before Scheduled Start.');
      return;
    }
    this.workOrderSaving = true;
    this.cdr.detectChanges();
    this.workOrderService
      .create({
        productionOrderId: this.order.id,
        operationId: value.operationId!,
        workCentreId: value.workCentreId!,
        sequence: this.workOrders.length + 1,
        plannedDurationMinutes: Number(value.plannedDurationMinutes),
        scheduledStartDate: value.scheduledStartDate?.trim() || undefined,
        scheduledEndDate: value.scheduledEndDate?.trim() || undefined,
      })
      .subscribe({
        next: (workOrder) => {
          this.workOrderSaving = false;
          this.workOrders = [...this.workOrders, workOrder];
          this.workOrderForm.reset({
            operationId: '',
            workCentreId: '',
            plannedDurationMinutes: '',
            scheduledStartDate: '',
            scheduledEndDate: '',
          });
          this.toast.success(`Work Order ${workOrder.workOrderNumber} added`);
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.workOrderSaving = false;
          this.toast.error(apiErrorMessage(err, 'Failed to add work order'));
          this.cdr.detectChanges();
        },
      });
  }

  removeWorkOrder(workOrder: WorkOrder): void {
    if (this.workOrderActionBusyId) {
      return;
    }
    this.workOrderActionBusyId = workOrder.id;
    this.cdr.detectChanges();
    this.workOrderService.remove(workOrder.id).subscribe({
      next: () => {
        this.workOrderActionBusyId = null;
        this.workOrders = this.workOrders.filter((w) => w.id !== workOrder.id);
        this.toast.success('Work order removed');
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.workOrderActionBusyId = null;
        this.toast.error(apiErrorMessage(err, 'Failed to remove work order'));
        this.cdr.detectChanges();
      },
    });
  }

  runWorkOrderAction(workOrder: WorkOrder, type: WorkOrderActionType): void {
    if (this.workOrderActionBusyId) {
      return;
    }
    this.workOrderActionBusyId = workOrder.id;
    this.cdr.detectChanges();

    const request$ =
      type === 'start'
        ? this.workOrderService.start(workOrder.id)
        : type === 'block'
          ? this.workOrderService.block(workOrder.id)
          : type === 'unblock'
            ? this.workOrderService.unblock(workOrder.id)
            : type === 'complete'
              ? this.workOrderService.complete(workOrder.id)
              : this.workOrderService.cancel(workOrder.id);

    const successMessage: Record<WorkOrderActionType, string> = {
      start: 'Work order started',
      block: 'Work order blocked',
      unblock: 'Work order unblocked',
      complete: 'Work order completed',
      cancel: 'Work order cancelled',
    };

    request$.subscribe({
      next: (updated) => {
        this.workOrderActionBusyId = null;
        this.workOrders = this.workOrders.map((w) => (w.id === updated.id ? updated : w));
        this.toast.success(successMessage[type]);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.workOrderActionBusyId = null;
        this.toast.error(apiErrorMessage(err, 'Action failed'));
        this.cdr.detectChanges();
      },
    });
  }

  save(): void {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      this.lines.controls.forEach((line) => line.markAllAsTouched());
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

    const rawLines = this.lines.getRawValue() as Array<{
      componentProductId: string;
      quantity: string;
      unitOfMeasureId: string;
      sequence: number;
    }>;
    for (const line of rawLines) {
      if (!this.products.find((p) => p.id === line.componentProductId)) {
        this.toast.error('Select a valid component product for every line.');
        return;
      }
      if (line.componentProductId === value.productId) {
        this.toast.error('A component cannot be the same product as the order output.');
        return;
      }
    }
    const componentIds = rawLines.map((l) => l.componentProductId);
    if (new Set(componentIds).size !== componentIds.length) {
      this.toast.error('Each component product can only appear once.');
      return;
    }
    const items: ProductionOrderItemLineInput[] = rawLines.map((line) => ({
      componentProductId: line.componentProductId,
      quantity: String(line.quantity).trim(),
      unitOfMeasureId: line.unitOfMeasureId,
      sequence: line.sequence,
    }));

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
      items,
    };

    this.saving = true;
    this.cdr.detectChanges();

    const request$ = this.order
      ? this.orders.update(this.order.id, payload)
      : this.orders.create(payload);

    request$.subscribe({
      next: (result) => {
        this.saving = false;
        this.toast.success(
          this.order
            ? 'Production order updated'
            : `Production Order ${result.orderNumber} created successfully.`,
        );
        this.router.navigate(['/production/production-orders', result.id]);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.saving = false;
        this.toast.error(apiErrorMessage(err, 'Save failed'));
        this.cdr.detectChanges();
      },
    });
  }

  discard(): void {
    this.router.navigate(['/production/production-orders']);
  }
}
