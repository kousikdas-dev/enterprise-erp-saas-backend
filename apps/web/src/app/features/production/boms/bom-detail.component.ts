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
import { Product, ProductUnit, Unit } from '../../inventory/models/inventory.models';
import { ProductService } from '../../inventory/products/product.service';
import { UnitService } from '../../inventory/units/unit.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { isPositiveDecimal } from '../../../shared/utils/decimal.util';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import {
  Bom,
  BomItemLineInput,
  BomOperationLineInput,
  Operation,
} from '../models/production.models';
import { OperationService } from '../operations/operation.service';
import { BomService } from './bom.service';

type PendingActionType = 'activate' | 'deactivate' | 'new-version';

function positiveQuantityValidator(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '').trim();
  if (!value) {
    return null;
  }
  return isPositiveDecimal(value) ? null : { positive: true };
}

@Component({
  selector: 'app-bom-detail',
  templateUrl: './bom-detail.component.html',
  styleUrls: ['./bom-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class BomDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly boms = inject(BomService);
  private readonly productService = inject(ProductService);
  private readonly unitService = inject(UnitService);
  private readonly operationService = inject(OperationService);
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canCreate = this.permissions.has(AppPermissions.PRODUCTION_BOMS_CREATE);
  readonly canUpdate = this.permissions.has(AppPermissions.PRODUCTION_BOMS_UPDATE);
  readonly canActivate = this.permissions.has(AppPermissions.PRODUCTION_BOMS_ACTIVATE);
  readonly canDeactivate = this.permissions.has(AppPermissions.PRODUCTION_BOMS_DEACTIVATE);

  isNew = true;
  bom: Bom | null = null;
  activeTab: 'components' | 'operations' | 'misc' = 'components';

  products: Product[] = [];
  units: Unit[] = [];
  operations: Operation[] = [];
  /** Variants (inventory-service Products whose templateProductId equals the chosen parent product) this BOM can optionally be scoped to. */
  variantsForParentProduct: Product[] = [];
  private readonly productUnitsByProduct = new Map<string, ProductUnit[]>();

  loading = false;
  saving = false;
  actionBusy = false;
  error: string | null = null;

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
    productVariantId: [''],
    items: this.fb.array<FormGroup>([]),
    operations: this.fb.array<FormGroup>([]),
  });

  get lines(): FormArray<FormGroup> {
    return this.form.get('items') as FormArray<FormGroup>;
  }

  get operationLines(): FormArray<FormGroup> {
    return this.form.get('operations') as FormArray<FormGroup>;
  }

  get eligibleProducts(): Product[] {
    return this.products.filter((p) => p.isActive && p.trackInventory);
  }

  get activeOperations(): Operation[] {
    return this.operations.filter((o) => o.isActive);
  }

  /** Form stays editable while creating, or editing a still-DRAFT BOM. */
  get isEditable(): boolean {
    return this.isNew || this.bom?.status === 'DRAFT';
  }

  get canActivateBom(): boolean {
    return !!this.bom && this.canActivate && this.bom.status !== 'ACTIVE';
  }

  get canDeactivateBom(): boolean {
    return !!this.bom && this.canDeactivate && this.bom.status === 'ACTIVE';
  }

  get canNewVersion(): boolean {
    return !!this.bom && this.canCreate;
  }

  ngOnInit(): void {
    this.lines.push(this.createLineGroup());
    this.form.get('parentProductId')!.valueChanges.subscribe((productId) => {
      if (this.isNew) {
        this.onParentProductChange(productId ?? '');
      }
    });

    const id = this.route.snapshot.paramMap.get('id');
    this.isNew = !id || id === 'new';
    this.loadLookups();
    if (!this.isNew && id) {
      this.loadBom(id);
    }
  }

  loadLookups(): void {
    forkJoin({
      products: this.productService.list(),
      units: this.unitService.list(),
      operations: this.operationService.list(),
    }).subscribe({
      next: ({ products, units, operations }) => {
        this.products = products.items ?? [];
        this.units = units.items ?? [];
        this.operations = operations.items ?? [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load product/UOM/operation lookups'));
        this.cdr.detectChanges();
      },
    });
  }

  loadBom(id: string): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.boms.getById(id).subscribe({
      next: (bom) => {
        this.bom = bom;
        this.form.reset({
          parentProductId: bom.parentProductId,
          bomQuantity: bom.bomQuantity,
          outputUnitOfMeasureId: bom.outputUnitOfMeasureId,
          effectiveFrom: bom.effectiveFrom ? bom.effectiveFrom.slice(0, 10) : '',
          effectiveTo: bom.effectiveTo ? bom.effectiveTo.slice(0, 10) : '',
          notes: bom.notes ?? '',
          productVariantId: bom.productVariantId ?? '',
        });
        this.ensureProductUnitsLoaded(bom.parentProductId);
        this.loadVariantsForParentProduct(bom.parentProductId);
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
        this.operationLines.clear();
        for (const operation of bom.operations ?? []) {
          this.operationLines.push(
            this.createOperationLineGroup(operation.operationId, operation.sequence),
          );
        }
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load BOM');
        this.cdr.detectChanges();
      },
    });
  }

  private onParentProductChange(productId: string): void {
    this.form.patchValue({ productVariantId: '' }, { emitEvent: false });
    this.variantsForParentProduct = [];
    if (!productId) {
      return;
    }
    const product = this.products.find((p) => p.id === productId);
    if (!product) {
      return;
    }
    this.form.patchValue({ outputUnitOfMeasureId: product.unitOfMeasureId }, { emitEvent: false });
    this.ensureProductUnitsLoaded(productId);
    this.loadVariantsForParentProduct(productId);
  }

  /** Variants of the given product (inventory-service Products whose templateProductId equals it) — optional scoping for the Product Variant field. */
  private loadVariantsForParentProduct(productId: string): void {
    this.productService.list(productId).subscribe({
      next: (res) => {
        this.variantsForParentProduct = (res.items ?? []).filter((p) => p.isActive);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load product variants'));
        this.cdr.detectChanges();
      },
    });
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
        [Validators.required, Validators.pattern(/^\d+(\.\d{1,6})?$/), positiveQuantityValidator],
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

  private onLineProductChange(group: FormGroup, productId: string): void {
    const product = this.products.find((p) => p.id === productId);
    if (!product) {
      return;
    }
    group.patchValue({ unitOfMeasureId: product.unitOfMeasureId }, { emitEvent: false });
    this.ensureProductUnitsLoaded(productId);
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

  addLine(): void {
    this.lines.push(this.createLineGroup(undefined, undefined, undefined, undefined, this.lines.length + 1));
  }

  removeLine(index: number): void {
    if (this.lines.length <= 1) {
      return;
    }
    this.lines.removeAt(index);
  }

  createOperationLineGroup(operationId = '', sequence = 1): FormGroup {
    return this.fb.group({
      operationId: [operationId, Validators.required],
      sequence: [sequence, [Validators.required, Validators.min(1)]],
    });
  }

  addOperation(): void {
    this.operationLines.push(
      this.createOperationLineGroup(undefined, this.operationLines.length + 1),
    );
  }

  removeOperation(index: number): void {
    this.operationLines.removeAt(index);
  }

  operationLabel(id: string): string {
    const operation = this.operations.find((o) => o.id === id);
    return operation ? `${operation.code} — ${operation.name}` : id.slice(0, 8);
  }

  variantLabel(id: string | null): string {
    if (!id) {
      return 'All Variants';
    }
    const variant = this.variantsForParentProduct.find((p) => p.id === id);
    return variant ? `${variant.sku} — ${variant.name}` : id.slice(0, 8);
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

  runAction(type: PendingActionType): void {
    if (!this.bom || this.actionBusy) {
      return;
    }
    const id = this.bom.id;
    this.actionBusy = true;
    this.cdr.detectChanges();

    const request$ =
      type === 'activate'
        ? this.boms.activate(id)
        : type === 'deactivate'
          ? this.boms.deactivate(id)
          : this.boms.newVersion(id);

    const successMessage: Record<PendingActionType, string> = {
      activate: 'BOM activated',
      deactivate: 'BOM deactivated',
      'new-version': 'New BOM version created',
    };

    request$.subscribe({
      next: (updated) => {
        this.actionBusy = false;
        this.toast.success(successMessage[type]);
        if (type === 'new-version') {
          this.router.navigate(['/production/boms', updated.id]);
        } else {
          this.bom = updated;
        }
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
    const parentProductId = this.bom ? this.bom.parentProductId : value.parentProductId;
    for (const line of rawLines) {
      if (!this.products.find((p) => p.id === line.componentProductId)) {
        this.toast.error('Select a valid component product for every line.');
        return;
      }
      if (!parentProductId) {
        this.toast.error('Select a parent product.');
        return;
      }
      if (line.componentProductId === parentProductId) {
        this.toast.error('A component cannot be the same product as the BOM parent.');
        return;
      }
    }
    const componentIds = rawLines.map((l) => l.componentProductId);
    if (new Set(componentIds).size !== componentIds.length) {
      this.toast.error('Each component product can only appear once in a BOM.');
      return;
    }

    const rawOperations = this.operationLines.getRawValue() as Array<{
      operationId: string;
      sequence: number;
    }>;
    for (const operation of rawOperations) {
      if (!this.operations.find((o) => o.id === operation.operationId)) {
        this.toast.error('Select a valid operation for every operation line.');
        return;
      }
    }
    const operationIds = rawOperations.map((o) => o.operationId);
    if (new Set(operationIds).size !== operationIds.length) {
      this.toast.error('Each operation can only appear once in a BOM.');
      return;
    }
    // Always sent (even empty) — the form reflects the complete desired
    // operations list, and the backend treats a present (possibly empty)
    // array as "replace", distinct from an omitted field meaning "leave
    // unchanged" (which this page never wants, since it always loads the
    // full current state first).
    const operations: BomOperationLineInput[] = rawOperations.map((operation) => ({
      operationId: operation.operationId,
      sequence: operation.sequence,
    }));

    const notes = value.notes?.trim() || undefined;
    const effectiveFrom = value.effectiveFrom?.trim() || undefined;
    const effectiveTo = value.effectiveTo?.trim() || undefined;
    const bomQuantity = String(value.bomQuantity).trim();
    const outputUnitOfMeasureId = value.outputUnitOfMeasureId!;
    // Always sent (even as null) for the same reason operations/items
    // always are — the form reflects the complete desired state, and the
    // backend's UpdateBomDto treats null as "clear", distinct from an
    // omitted field meaning "leave unchanged".
    const productVariantId = value.productVariantId?.trim() || null;
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

    const request$ = this.bom
      ? this.boms.update(this.bom.id, {
          bomQuantity,
          outputUnitOfMeasureId,
          effectiveFrom,
          effectiveTo,
          notes,
          items,
          operations,
          productVariantId,
        })
      : this.boms.create({
          parentProductId: value.parentProductId!,
          bomQuantity,
          outputUnitOfMeasureId,
          effectiveFrom,
          effectiveTo,
          notes,
          items,
          operations,
          ...(productVariantId ? { productVariantId } : {}),
        });

    request$.subscribe({
      next: (result) => {
        this.saving = false;
        this.toast.success(this.bom ? 'BOM updated' : 'BOM created');
        this.router.navigate(['/production/boms', result.id]);
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
    this.router.navigate(['/production/boms']);
  }
}
