import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  TemplateRef,
  ViewChild,
  inject,
} from '@angular/core';
import { AbstractControl, FormBuilder, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { forkJoin } from 'rxjs';
import { AppPermissions } from '../../../core/permissions/permissions.constants';
import { PermissionService } from '../../../core/permissions/permission.service';
import { Product, Unit, Warehouse } from '../../inventory/models/inventory.models';
import { ProductService } from '../../inventory/products/product.service';
import { UnitService } from '../../inventory/units/unit.service';
import { WarehouseService } from '../../inventory/warehouses/warehouse.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { isPositiveDecimal } from '../../../shared/utils/decimal.util';
import { Bom, UnbuildOrder } from '../models/production.models';
import { BomService } from '../boms/bom.service';
import { UnbuildOrderService } from './unbuild-order.service';

type PendingActionType = 'complete' | 'cancel';

export interface UnbuildPreviewItem {
  componentProductId: string;
  componentProductSku: string;
  componentProductName: string;
  quantity: string;
  uomCode: string;
  uomName: string;
}

/** Rejects zero/negative quantities; empty values are left to Validators.required. */
function positiveQuantityValidator(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '').trim();
  if (!value) {
    return null;
  }
  return isPositiveDecimal(value) ? null : { positive: true };
}

@Component({
  selector: 'app-unbuild-order-detail',
  templateUrl: './unbuild-order-detail.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class UnbuildOrderDetailComponent implements OnInit {
  @ViewChild('confirmModal') confirmModal!: TemplateRef<unknown>;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly unbuildOrders = inject(UnbuildOrderService);
  private readonly boms = inject(BomService);
  private readonly productService = inject(ProductService);
  private readonly unitService = inject(UnitService);
  private readonly warehouseService = inject(WarehouseService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canCreate = this.permissions.has(AppPermissions.PRODUCTION_UNBUILD_ORDERS_CREATE);
  readonly canUpdate = this.permissions.has(AppPermissions.PRODUCTION_UNBUILD_ORDERS_UPDATE);
  readonly canComplete = this.permissions.has(AppPermissions.PRODUCTION_UNBUILD_ORDERS_COMPLETE);
  readonly canCancel = this.permissions.has(AppPermissions.PRODUCTION_UNBUILD_ORDERS_CANCEL);

  isNew = true;
  order: UnbuildOrder | null = null;
  bomsForSelectedProduct: Bom[] = [];
  previewItems: UnbuildPreviewItem[] = [];

  products: Product[] = [];
  units: Unit[] = [];
  warehouses: Warehouse[] = [];

  loading = false;
  saving = false;
  actionBusy = false;
  error: string | null = null;

  pendingAction: PendingActionType | null = null;

  form = this.fb.group({
    productId: ['', Validators.required],
    bomId: ['', Validators.required],
    quantity: [
      '',
      [Validators.required, Validators.pattern(/^\d+(\.\d{1,6})?$/), positiveQuantityValidator],
    ],
    unitOfMeasureId: ['', Validators.required],
    warehouseId: ['', Validators.required],
    unbuildDate: ['', Validators.required],
    notes: ['', Validators.maxLength(500)],
  });

  /** Form fields stay editable while creating, or editing a still-DRAFT order. */
  get isEditable(): boolean {
    return this.isNew || this.order?.status === 'DRAFT';
  }

  get selectedProduct(): Product | undefined {
    return this.products.find((p) => p.id === this.form.value.productId);
  }

  ngOnInit(): void {
    this.form.get('productId')!.valueChanges.subscribe((productId) => {
      if (this.isEditable) {
        this.onProductChange(productId ?? '');
      }
    });
    this.form.get('bomId')!.valueChanges.subscribe(() => {
      if (this.isEditable) {
        this.recomputePreview();
      }
    });
    this.form.get('quantity')!.valueChanges.subscribe(() => {
      if (this.isEditable) {
        this.recomputePreview();
      }
    });

    const id = this.route.snapshot.paramMap.get('id');
    this.isNew = !id || id === 'new';
    this.loadLookups();
    if (!this.isNew && id) {
      this.loadOrder(id);
    } else {
      this.form.patchValue({ unbuildDate: new Date().toISOString().slice(0, 10) });
    }
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
        this.toast.error(apiErrorMessage(err, 'Failed to load product/warehouse lookups'));
        this.cdr.detectChanges();
      },
    });
  }

  loadOrder(id: string): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.unbuildOrders.getById(id).subscribe({
      next: (order) => {
        this.order = order;
        this.form.reset(
          {
            productId: order.productId,
            bomId: order.bomId,
            quantity: order.quantity,
            unitOfMeasureId: order.unitOfMeasureId,
            warehouseId: order.warehouseId,
            unbuildDate: order.unbuildDate.slice(0, 10),
            notes: order.notes ?? '',
          },
          { emitEvent: false },
        );
        // Only the order's own BOM (whatever its current status) plus any
        // other non-DRAFT version of this product's BOM is selectable —
        // mirrors the backend's "status != DRAFT" historical-activation
        // rule (an INACTIVE, superseded version stays valid for an
        // existing order's traceability even though it's not offered when
        // creating a brand-new one).
        this.boms.list(order.productId).subscribe((res) => {
          this.bomsForSelectedProduct = (res.items ?? []).filter(
            (b) => b.status !== 'DRAFT' || b.id === order.bomId,
          );
          this.recomputePreview();
          this.cdr.detectChanges();
        });
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load unbuild order');
        this.cdr.detectChanges();
      },
    });
  }

  private onProductChange(productId: string): void {
    this.form.patchValue({ bomId: '', unitOfMeasureId: '' }, { emitEvent: false });
    this.bomsForSelectedProduct = [];
    this.previewItems = [];
    if (!productId) {
      return;
    }
    const product = this.products.find((p) => p.id === productId);
    if (product) {
      // Base-unit-only: the backend rejects anything but the product's own
      // base unit for the finished good, so there is nothing to choose —
      // set it directly rather than offering a dropdown that could select
      // an alternate unit the backend would reject.
      this.form.patchValue({ unitOfMeasureId: product.unitOfMeasureId }, { emitEvent: false });
    }
    this.boms.list(productId).subscribe({
      next: (res) => {
        // A BOM is selectable for Unbuild once it has ever been activated
        // (status ACTIVE or INACTIVE) — DRAFT BOMs were never activated
        // and are rejected by the backend.
        this.bomsForSelectedProduct = (res.items ?? []).filter((b) => b.status !== 'DRAFT');
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load BOMs for this product'));
        this.cdr.detectChanges();
      },
    });
  }

  /**
   * Client-side preview only, using the exact same scale formula
   * production-service applies server-side (quantity / bom.bomQuantity,
   * uniformly over every BOM item, scrap ignored on return) — purely
   * informational; the saved order's actual items are always computed
   * server-side from the BOM at create/update time, never from this
   * preview.
   */
  private recomputePreview(): void {
    // Read each control's OWN value directly, not the parent FormGroup's
    // aggregate `.value` — Angular only re-aggregates the parent AFTER a
    // child's own valueChanges fires, so inside a subscriber triggered by
    // one of these two controls changing, `this.form.value` would reflect
    // a stale snapshot for whichever field just changed.
    const bomId = this.form.get('bomId')!.value as string;
    const bom = this.bomsForSelectedProduct.find((b) => b.id === bomId);
    const qty = Number(this.form.get('quantity')!.value) || 0;
    if (!bom || qty <= 0) {
      this.previewItems = [];
      this.cdr.detectChanges();
      return;
    }
    const scale = qty / Number(bom.bomQuantity || 1);
    this.previewItems = bom.items.map((item) => ({
      componentProductId: item.componentProductId,
      componentProductSku: item.componentProductSku,
      componentProductName: item.componentProductName,
      quantity: (Number(item.quantity) * scale).toFixed(6),
      uomCode: item.uomCode,
      uomName: item.uomName,
    }));
    this.cdr.detectChanges();
  }

  /** The selected product's own base unit — the only unit the backend accepts for the finished good. */
  baseUomLabel(productId: string): string {
    const product = this.products.find((p) => p.id === productId);
    if (!product) return '—';
    const unit = this.units.find((u) => u.id === product.unitOfMeasureId);
    return unit ? `${unit.code} — ${unit.name}` : '—';
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
      case 'PROCESSING':
        return 'bg-warning text-dark';
      case 'DONE':
        return 'bg-success';
      case 'CANCELLED':
        return 'bg-dark';
      default:
        return 'bg-secondary';
    }
  }

  get canCompleteOrder(): boolean {
    return !!this.order && this.canComplete && this.order.status === 'DRAFT';
  }

  get canCancelOrder(): boolean {
    return !!this.order && this.canCancel && this.order.status === 'DRAFT';
  }

  askComplete(): void {
    if (!this.canCompleteOrder) return;
    this.pendingAction = 'complete';
    this.modal.open(this.confirmModal, { centered: true });
  }

  askCancel(): void {
    if (!this.canCancelOrder) return;
    this.pendingAction = 'cancel';
    this.modal.open(this.confirmModal, { centered: true });
  }

  runPendingAction(modal: { close: () => void }): void {
    if (!this.order || !this.pendingAction || this.actionBusy) {
      return;
    }
    const type = this.pendingAction;
    const id = this.order.id;
    this.actionBusy = true;
    this.cdr.detectChanges();

    const request$ = type === 'complete' ? this.unbuildOrders.complete(id) : this.unbuildOrders.cancel(id);

    request$.subscribe({
      next: (updated) => {
        this.actionBusy = false;
        modal.close();
        this.pendingAction = null;
        this.order = updated;
        this.toast.success(type === 'complete' ? 'Unbuild order completed' : 'Unbuild order cancelled');
        this.cdr.detectChanges();
      },
      error: (err) => {
        modal.close();
        this.pendingAction = null;
        if (type !== 'complete') {
          this.actionBusy = false;
          this.toast.error(apiErrorMessage(err, 'Action failed'));
          this.cdr.detectChanges();
          return;
        }
        // Completion's failure is ambiguous: inventory-service may have
        // already committed the posting even though this response itself
        // failed (network error, timeout, 5xx). Never report success or
        // failure outright — reload the order and act on its actual
        // current status.
        this.unbuildOrders.getById(id).subscribe({
          next: (reloaded) => {
            this.actionBusy = false;
            this.order = reloaded;
            if (reloaded.status === 'DONE') {
              this.toast.success('Unbuild order completed');
            } else {
              this.toast.error(apiErrorMessage(err, 'Completion could not be confirmed'));
            }
            this.cdr.detectChanges();
          },
          error: () => {
            this.actionBusy = false;
            this.toast.error(
              apiErrorMessage(
                err,
                "Completion could not be confirmed; refresh this page to check the order's status",
              ),
            );
            this.cdr.detectChanges();
          },
        });
      },
    });
  }

  save(): void {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();

    if (this.order) {
      const payload = {
        quantity: String(value.quantity).trim(),
        warehouseId: value.warehouseId!,
        unbuildDate: value.unbuildDate!,
        notes: value.notes?.trim() || undefined,
      };
      this.saving = true;
      this.cdr.detectChanges();
      this.unbuildOrders.update(this.order.id, payload).subscribe({
        next: (result) => {
          this.saving = false;
          this.order = result;
          this.toast.success('Unbuild order updated');
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          this.toast.error(apiErrorMessage(err, 'Save failed'));
          this.cdr.detectChanges();
        },
      });
      return;
    }

    const payload = {
      productId: value.productId!,
      bomId: value.bomId!,
      quantity: String(value.quantity).trim(),
      unitOfMeasureId: value.unitOfMeasureId!,
      warehouseId: value.warehouseId!,
      unbuildDate: value.unbuildDate!,
      notes: value.notes?.trim() || undefined,
    };

    this.saving = true;
    this.cdr.detectChanges();
    this.unbuildOrders.create(payload).subscribe({
      next: (result) => {
        this.saving = false;
        this.toast.success(`Unbuild Order ${result.orderNumber} created successfully.`);
        this.router.navigate(['/production/unbuild-orders', result.id]);
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
    this.router.navigate(['/production/unbuild-orders']);
  }
}
