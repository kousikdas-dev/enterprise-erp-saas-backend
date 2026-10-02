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
  FormArray,
  FormBuilder,
  FormGroup,
  ValidationErrors,
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
import { isPositiveDecimal } from '../../../shared/utils/decimal.util';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { Bom, BOM_STATUSES, BomItemLineInput, BomStatus } from '../models/production.models';
import { BomService } from './bom.service';

type PendingActionType = 'activate' | 'deactivate' | 'delete' | 'new-version';

/** Rejects zero/negative quantities; empty values are left to Validators.required. */
function positiveQuantityValidator(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '').trim();
  if (!value) {
    return null;
  }
  return isPositiveDecimal(value) ? null : { positive: true };
}

@Component({
  selector: 'app-bom-list',
  templateUrl: './bom-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class BomListComponent implements OnInit {
  @ViewChild('formModal') formModal!: TemplateRef<unknown>;
  @ViewChild('detailModal') detailModal!: TemplateRef<unknown>;
  @ViewChild('confirmModal') confirmModal!: TemplateRef<unknown>;

  private readonly boms = inject(BomService);
  private readonly productService = inject(ProductService);
  private readonly unitService = inject(UnitService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canCreate = this.permissions.has(AppPermissions.PRODUCTION_BOMS_CREATE);
  readonly canUpdate = this.permissions.has(AppPermissions.PRODUCTION_BOMS_UPDATE);
  readonly canDelete = this.permissions.has(AppPermissions.PRODUCTION_BOMS_DELETE);
  readonly canActivate = this.permissions.has(AppPermissions.PRODUCTION_BOMS_ACTIVATE);
  readonly canDeactivate = this.permissions.has(
    AppPermissions.PRODUCTION_BOMS_DEACTIVATE,
  );

  readonly statuses: readonly BomStatus[] = BOM_STATUSES;

  items: Bom[] = [];
  products: Product[] = [];
  units: Unit[] = [];
  private readonly productUnitsByProduct = new Map<string, ProductUnit[]>();
  private readonly loadingProductUnits = new Set<string>();
  loading = false;
  error: string | null = null;

  // Filter bar state — applied client-side against the already-loaded tenant
  // list, mirroring PurchaseOrderListComponent's `filter`/`filtered` pattern.
  // production-service's list() only accepts a server-side parentProductId
  // filter (see bom.service.ts); status/free-text narrowing is done here
  // rather than inventing unsupported query params.
  search = '';
  filterParentProductId = '';
  filterStatus = '';

  saving = false;
  actionBusy = false;
  editing: Bom | null = null;
  viewing: Bom | null = null;
  pendingAction: { type: PendingActionType; bom: Bom } | null = null;
  private modalRef?: NgbModalRef;

  form = this.fb.group({
    parentProductId: ['', Validators.required],
    bomQuantity: [
      '',
      [Validators.required, Validators.pattern(/^\d+(\.\d{1,6})?$/), positiveQuantityValidator],
    ],
    outputUnitOfMeasureId: ['', Validators.required],
    effectiveFrom: [''],
    effectiveTo: [''],
    notes: ['', Validators.maxLength(500)],
    items: this.fb.array<FormGroup>([]),
  });

  ngOnInit(): void {
    this.lines.push(this.createLineGroup());
    this.form.get('parentProductId')!.valueChanges.subscribe((productId) => {
      this.onParentProductChange(productId ?? '');
    });
    this.loadLookups();
    this.load();
  }

  /**
   * Selecting the parent product (create mode only) defaults Output UOM to
   * its base unit and loads its alternatives. Skipped while editing: the
   * parentProductId control is only populated there via form.reset() to
   * display the existing BOM's parent, and must not override the BOM's
   * already-chosen outputUnitOfMeasureId.
   */
  private onParentProductChange(productId: string): void {
    if (this.editing) {
      return;
    }
    const product = this.products.find((p) => p.id === productId);
    if (!product) {
      return;
    }
    this.form.patchValue(
      { outputUnitOfMeasureId: product.unitOfMeasureId },
      { emitEvent: false },
    );
    this.ensureProductUnitsLoaded(productId);
  }

  /** UOM select options for the BOM Output UOM: parent product's base unit + active alternative units. */
  outputUomOptionsFor(productId: string): Array<{ id: string; label: string }> {
    return this.uomOptionsFor(productId);
  }

  get lines(): FormArray<FormGroup> {
    return this.form.get('items') as FormArray<FormGroup>;
  }

  /** Distinct parent products among the currently loaded BOMs, for the filter dropdown. */
  get filterParentProductOptions(): Array<{ id: string; sku: string; name: string }> {
    const seen = new Map<string, { id: string; sku: string; name: string }>();
    for (const bom of this.items) {
      if (!seen.has(bom.parentProductId)) {
        seen.set(bom.parentProductId, {
          id: bom.parentProductId,
          sku: bom.parentProductSku,
          name: bom.parentProductName,
        });
      }
    }
    return [...seen.values()].sort((a, b) => a.sku.localeCompare(b.sku));
  }

  get filtered(): Bom[] {
    const q = this.search.trim().toLowerCase();
    return this.items.filter((b) => {
      if (this.filterParentProductId && b.parentProductId !== this.filterParentProductId) {
        return false;
      }
      if (this.filterStatus && b.status !== this.filterStatus) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        b.id.toLowerCase().includes(q) ||
        b.parentProductSku.toLowerCase().includes(q) ||
        b.parentProductName.toLowerCase().includes(q) ||
        b.status.toLowerCase().includes(q) ||
        String(b.version).includes(q)
      );
    });
  }

  clearFilters(): void {
    this.search = '';
    this.filterParentProductId = '';
    this.filterStatus = '';
    this.cdr.detectChanges();
  }

  createLineGroup(
    componentProductId = '',
    quantity = '',
    unitOfMeasureId = '',
    scrapPercentage = '',
    sequence = 1,
  ): FormGroup {
    const group = this.fb.group({
      componentProductId: [componentProductId, Validators.required],
      quantity: [
        quantity,
        [
          Validators.required,
          Validators.pattern(/^\d+(\.\d{1,6})?$/),
          positiveQuantityValidator,
        ],
      ],
      unitOfMeasureId: [unitOfMeasureId, Validators.required],
      scrapPercentage: [
        scrapPercentage,
        [Validators.pattern(/^\d+(\.\d{1,2})?$/), Validators.min(0), Validators.max(100)],
      ],
      sequence: [sequence, [Validators.required, Validators.min(1)]],
    });

    group.get('componentProductId')!.valueChanges.subscribe((productId) => {
      this.onLineProductChange(group, productId ?? '');
    });

    return group;
  }

  /** Selecting a component product defaults its UOM to that product's base unit and loads its alternatives. */
  private onLineProductChange(group: FormGroup, productId: string): void {
    const product = this.products.find((p) => p.id === productId);
    if (!product) {
      return;
    }
    group.patchValue(
      { unitOfMeasureId: product.unitOfMeasureId },
      { emitEvent: false },
    );
    this.ensureProductUnitsLoaded(productId);
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

  /** UOM select options for a line's chosen component product: base unit + active alternative units. */
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

  /** Products eligible as a BOM parent/component: active and inventory-tracked, mirroring the backend rule. */
  get eligibleProducts(): Product[] {
    return this.products.filter((p) => p.isActive && p.trackInventory);
  }

  productLabel(id: string): string {
    const p = this.products.find((x) => x.id === id);
    return p ? `${p.sku} — ${p.name}` : id.slice(0, 8);
  }

  statusBadgeClass(status: string): string {
    switch (status) {
      case 'DRAFT':
        return 'bg-secondary';
      case 'ACTIVE':
        return 'bg-success';
      case 'INACTIVE':
        return 'bg-dark';
      default:
        return 'bg-secondary';
    }
  }

  canView(_bom: Bom): boolean {
    return true;
  }

  canEdit(bom: Bom): boolean {
    return this.canUpdate && bom.status === 'DRAFT';
  }

  canRemove(bom: Bom): boolean {
    // Backend only allows deleting DRAFT BOMs (ConflictException otherwise) —
    // ACTIVE/INACTIVE never offer Delete, matching "INACTIVE: Delete only if
    // backend permits."
    return this.canDelete && bom.status === 'DRAFT';
  }

  canActivateBom(bom: Bom): boolean {
    return this.canActivate && bom.status !== 'ACTIVE';
  }

  canDeactivateBom(bom: Bom): boolean {
    return this.canDeactivate && bom.status === 'ACTIVE';
  }

  canNewVersion(_bom: Bom): boolean {
    // Backend clones from any source status (DRAFT/ACTIVE/INACTIVE).
    return this.canCreate;
  }

  loadLookups(): void {
    forkJoin({
      products: this.productService.list(),
      units: this.unitService.list(),
    }).subscribe({
      next: ({ products, units }) => {
        this.products = products.items ?? [];
        this.units = units.items ?? [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load product/UOM lookups'));
        this.cdr.detectChanges();
      },
    });
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.boms.list().subscribe({
      next: (res) => {
        this.items = res.items ?? [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load BOMs');
        this.cdr.detectChanges();
      },
    });
  }

  addLine(): void {
    this.lines.push(this.createLineGroup(undefined, undefined, undefined, undefined, this.lines.length + 1));
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
      parentProductId: '',
      bomQuantity: '',
      outputUnitOfMeasureId: '',
      effectiveFrom: '',
      effectiveTo: '',
      notes: '',
    });
    this.lines.clear();
    this.lines.push(this.createLineGroup());
    this.modalRef = this.modal.open(this.formModal, { centered: true, size: 'xl' });
  }

  openEdit(bom: Bom): void {
    if (!this.canEdit(bom)) {
      return;
    }
    this.editing = bom;
    this.form.reset({
      parentProductId: bom.parentProductId,
      bomQuantity: bom.bomQuantity,
      outputUnitOfMeasureId: bom.outputUnitOfMeasureId,
      effectiveFrom: bom.effectiveFrom ? bom.effectiveFrom.slice(0, 10) : '',
      effectiveTo: bom.effectiveTo ? bom.effectiveTo.slice(0, 10) : '',
      notes: bom.notes ?? '',
    });
    this.ensureProductUnitsLoaded(bom.parentProductId);
    this.lines.clear();
    for (const line of bom.items ?? []) {
      this.lines.push(
        this.createLineGroup(
          line.componentProductId,
          line.quantity,
          line.unitOfMeasureId,
          line.scrapPercentage ?? '',
          line.sequence,
        ),
      );
      this.ensureProductUnitsLoaded(line.componentProductId);
    }
    if (this.lines.length === 0) {
      this.lines.push(this.createLineGroup());
    }
    this.modalRef = this.modal.open(this.formModal, { centered: true, size: 'xl' });
  }

  openDetail(bom: Bom): void {
    this.viewing = bom;
    this.modal.open(this.detailModal, { centered: true, size: 'lg' });
    this.boms.getById(bom.id).subscribe({
      next: (detail) => {
        this.viewing = detail;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load BOM details'));
        this.cdr.detectChanges();
      },
    });
  }

  askActivate(bom: Bom): void {
    this.pendingAction = { type: 'activate', bom };
    this.modal.open(this.confirmModal, { centered: true });
  }

  askDeactivate(bom: Bom): void {
    this.pendingAction = { type: 'deactivate', bom };
    this.modal.open(this.confirmModal, { centered: true });
  }

  askDelete(bom: Bom): void {
    this.pendingAction = { type: 'delete', bom };
    this.modal.open(this.confirmModal, { centered: true });
  }

  askNewVersion(bom: Bom): void {
    this.pendingAction = { type: 'new-version', bom };
    this.modal.open(this.confirmModal, { centered: true });
  }

  confirmActionLabel(type: PendingActionType | undefined): string {
    switch (type) {
      case 'activate':
        return 'Activate';
      case 'deactivate':
        return 'Deactivate';
      case 'new-version':
        return 'Create Version';
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
    const { type, bom } = this.pendingAction;
    this.actionBusy = true;
    this.cdr.detectChanges();

    const request$: Observable<unknown> =
      type === 'activate'
        ? this.boms.activate(bom.id)
        : type === 'deactivate'
          ? this.boms.deactivate(bom.id)
          : type === 'new-version'
            ? this.boms.newVersion(bom.id)
            : this.boms.remove(bom.id);

    const successMessage: Record<PendingActionType, string> = {
      activate: 'BOM activated',
      deactivate: 'BOM deactivated',
      delete: 'BOM deleted',
      'new-version': 'New BOM version created',
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
      this.lines.controls.forEach((line) => line.markAllAsTouched());
      return;
    }

    const value = this.form.getRawValue();
    if (value.effectiveFrom && value.effectiveTo && value.effectiveTo < value.effectiveFrom) {
      this.toast.error('Effective To cannot be before Effective From.');
      return;
    }

    const rawLines = this.lines.getRawValue() as Array<{
      componentProductId: string;
      quantity: string;
      unitOfMeasureId: string;
      scrapPercentage: string;
      sequence: number;
    }>;
    if (rawLines.length === 0) {
      this.toast.error('Add at least one component.');
      return;
    }
    for (const line of rawLines) {
      if (!this.products.find((p) => p.id === line.componentProductId)) {
        this.toast.error('Select a valid component product for every line.');
        return;
      }
      if (!this.form.get('parentProductId')?.value) {
        this.toast.error('Select a parent product.');
        return;
      }
      if (line.componentProductId === this.parentProductIdForSave()) {
        this.toast.error('A component cannot be the same product as the BOM parent.');
        return;
      }
    }
    const componentIds = rawLines.map((l) => l.componentProductId);
    if (new Set(componentIds).size !== componentIds.length) {
      this.toast.error('Each component product can only appear once in a BOM.');
      return;
    }

    const notes = value.notes?.trim() || undefined;
    const effectiveFrom = value.effectiveFrom?.trim() || undefined;
    const effectiveTo = value.effectiveTo?.trim() || undefined;
    const bomQuantity = String(value.bomQuantity).trim();
    const outputUnitOfMeasureId = value.outputUnitOfMeasureId!;
    const items: BomItemLineInput[] = rawLines.map((line) => {
      const scrapPercentage = line.scrapPercentage?.trim() || undefined;
      return {
        componentProductId: line.componentProductId,
        quantity: String(line.quantity).trim(),
        unitOfMeasureId: line.unitOfMeasureId,
        sequence: line.sequence,
        ...(scrapPercentage ? { scrapPercentage } : {}),
      };
    });

    this.saving = true;
    this.cdr.detectChanges();

    const request$ = this.editing
      ? this.boms.update(this.editing.id, {
          bomQuantity,
          outputUnitOfMeasureId,
          effectiveFrom,
          effectiveTo,
          notes,
          items,
        })
      : this.boms.create({
          parentProductId: value.parentProductId!,
          bomQuantity,
          outputUnitOfMeasureId,
          effectiveFrom,
          effectiveTo,
          notes,
          items,
        });

    request$.subscribe({
      next: () => {
        this.saving = false;
        this.modalRef?.close();
        this.toast.success(this.editing ? 'BOM updated' : 'BOM created');
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

  private parentProductIdForSave(): string {
    return this.editing ? this.editing.parentProductId : (this.form.get('parentProductId')?.value ?? '');
  }
}
