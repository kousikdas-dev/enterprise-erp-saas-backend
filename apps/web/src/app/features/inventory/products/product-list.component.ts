import {
  Component,
  OnInit,
  TemplateRef,
  ViewChild,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { forkJoin, Observable } from 'rxjs';
import { AppPermissions } from '../../../core/permissions/permissions.constants';
import { PermissionService } from '../../../core/permissions/permission.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { isPositiveDecimal } from '../../../shared/utils/decimal.util';
import { AttributeService } from '../attributes/attribute.service';
import { CategoryService } from '../categories/category.service';
import {
  Attribute,
  Category,
  CreateProductUnitRequest,
  PRODUCT_TYPES,
  Product,
  ProductType,
  ProductUnit,
  Unit,
} from '../models/inventory.models';
import { UnitService } from '../units/unit.service';
import { ProductService } from './product.service';

const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  GOODS: 'Goods',
  SERVICE: 'Service',
  COMBO: 'Combo',
};

@Component({
  selector: 'app-product-list',
  templateUrl: './product-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class ProductListComponent implements OnInit {
  @ViewChild('formModal') formModal!: TemplateRef<unknown>;
  @ViewChild('detailModal') detailModal!: TemplateRef<unknown>;

  private readonly products = inject(ProductService);
  private readonly categoryService = inject(CategoryService);
  private readonly unitService = inject(UnitService);
  private readonly attributeService = inject(AttributeService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canCreate = this.permissions.has(AppPermissions.PRODUCTS_CREATE);
  readonly canUpdate = this.permissions.has(AppPermissions.PRODUCTS_UPDATE);
  readonly productTypes = PRODUCT_TYPES;
  readonly productTypeLabels = PRODUCT_TYPE_LABELS;

  items: Product[] = [];
  categories: Category[] = [];
  units: Unit[] = [];
  attributes: Attribute[] = [];
  loading = false;
  error: string | null = null;
  filter = '';
  saving = false;
  editing: Product | null = null;
  viewing: Product | null = null;
  viewingUnits: ProductUnit[] = [];
  viewingUnitsLoading = false;
  loadingUnits = false;
  private removedUnitIds: string[] = [];
  private modalRef?: NgbModalRef;

  form = this.fb.group({
    sku: ['', [Validators.required, Validators.maxLength(64)]],
    name: ['', [Validators.required, Validators.maxLength(160)]],
    description: ['', [Validators.maxLength(500)]],
    categoryId: ['', [Validators.required]],
    unitOfMeasureId: ['', [Validators.required]],
    sellingPrice: ['', [Validators.required, Validators.pattern(/^\d+(\.\d+)?$/)]],
    costPrice: ['', [Validators.required, Validators.pattern(/^\d+(\.\d+)?$/)]],
    isActive: [true],
    productType: ['GOODS' as ProductType, [Validators.required]],
    trackInventory: [true],
    barcode: ['', [Validators.maxLength(128)]],
    note: ['', [Validators.maxLength(1000)]],
    templateProductId: [''],
    additionalUnits: this.fb.array<FormGroup>([]),
  });

  /** Plain array, not a FormArray — there's no per-item validation, just a set of ids toggled by checkbox. */
  selectedAttributeValueIds: string[] = [];

  ngOnInit(): void {
    this.loadLookups();
    this.load();
    // If the base unit changes to one already used by an additional-unit
    // row, that row is no longer valid — clear it so the user must pick
    // a different unit rather than silently keeping an invalid selection.
    this.form.controls.unitOfMeasureId.valueChanges.subscribe((baseUnitId) => {
      if (!baseUnitId) {
        return;
      }
      for (const control of this.additionalUnits.controls) {
        const group = control as FormGroup;
        if (group.controls.unitOfMeasureId.value === baseUnitId) {
          group.controls.unitOfMeasureId.setValue('');
        }
      }
    });
  }

  get additionalUnits(): FormArray<FormGroup> {
    return this.form.controls.additionalUnits;
  }

  /** Only top-level products (not themselves a variant) can be a "Variant Of" target — no nested variant chains. */
  get eligibleTemplateProducts(): Product[] {
    return this.items.filter(
      (p) => !p.templateProductId && p.id !== this.editing?.id,
    );
  }

  toggleAttributeValue(id: string): void {
    const index = this.selectedAttributeValueIds.indexOf(id);
    if (index === -1) {
      this.selectedAttributeValueIds = [...this.selectedAttributeValueIds, id];
    } else {
      this.selectedAttributeValueIds = this.selectedAttributeValueIds.filter(
        (x) => x !== id,
      );
    }
  }

  isAttributeValueSelected(id: string): boolean {
    return this.selectedAttributeValueIds.includes(id);
  }

  get filtered(): Product[] {
    const q = this.filter.trim().toLowerCase();
    if (!q) {
      return this.items;
    }
    return this.items.filter(
      (p) =>
        p.sku.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q) ||
        (p.barcode ?? '').toLowerCase().includes(q) ||
        (p.note ?? '').toLowerCase().includes(q),
    );
  }

  categoryName(id: string): string {
    return this.categories.find((c) => c.id === id)?.name ?? id.slice(0, 8);
  }

  productLabel(id: string): string {
    const p = this.items.find((x) => x.id === id);
    return p ? `${p.sku} — ${p.name}` : id.slice(0, 8);
  }

  productTypeLabel(type: ProductType): string {
    return this.productTypeLabels[type] ?? type;
  }

  unitLabel(id: string): string {
    const unit = this.units.find((u) => u.id === id);
    return unit ? `${unit.code} — ${unit.name}` : id.slice(0, 8);
  }

  /** Units selectable for one additional-unit row: excludes the base unit
   *  and any unit already chosen in another additional-unit row. */
  availableUnitsForRow(index: number): Unit[] {
    const baseUnitId = this.form.controls.unitOfMeasureId.value;
    const chosenElsewhere = this.additionalUnits.controls
      .filter((_, i) => i !== index)
      .map((c) => (c as FormGroup).controls.unitOfMeasureId.value as string)
      .filter((id) => !!id);
    return this.units.filter(
      (u) => u.id !== baseUnitId && !chosenElsewhere.includes(u.id),
    );
  }

  addUnitRow(): void {
    this.additionalUnits.push(this.createUnitGroup());
  }

  removeUnitRow(index: number): void {
    const group = this.additionalUnits.at(index);
    const id = group.controls.id.value as string | null;
    if (id) {
      this.removedUnitIds.push(id);
    }
    this.additionalUnits.removeAt(index);
  }

  private createUnitGroup(unit: Partial<ProductUnit> = {}): FormGroup {
    return this.fb.group({
      id: [unit.id ?? null],
      unitOfMeasureId: [unit.unitOfMeasureId ?? '', Validators.required],
      conversionFactor: [
        unit.conversionFactor ?? '',
        [Validators.required, Validators.pattern(/^\d+(\.\d+)?$/)],
      ],
      sellingPrice: [
        unit.sellingPrice ?? '',
        [Validators.required, Validators.pattern(/^\d+(\.\d+)?$/)],
      ],
      costPrice: [
        unit.costPrice ?? '',
        [Validators.required, Validators.pattern(/^\d+(\.\d+)?$/)],
      ],
      isActive: [unit.isActive ?? true],
    });
  }

  /** Cross-row rules a single field Validator can't express: no duplicate
   *  units, base unit excluded, conversion factor strictly positive. */
  private validateAdditionalUnits(baseUnitId: string): string | null {
    const rows = this.additionalUnits.getRawValue() as Array<{
      unitOfMeasureId: string;
      conversionFactor: string;
    }>;
    const seen = new Set<string>();
    for (const row of rows) {
      if (row.unitOfMeasureId === baseUnitId) {
        return "An additional unit cannot be the same as the product's base unit.";
      }
      if (seen.has(row.unitOfMeasureId)) {
        return 'Each unit can only be added once as an additional unit.';
      }
      seen.add(row.unitOfMeasureId);
      if (!isPositiveDecimal(row.conversionFactor)) {
        return 'Conversion factor must be greater than 0 for every additional unit.';
      }
    }
    return null;
  }

  /** Diffs the additional-units rows against what's on the server: creates
   *  new rows, updates existing ones, deletes rows the user removed. */
  private syncProductUnits(productId: string): Observable<unknown[]> {
    const rows = this.additionalUnits.getRawValue() as Array<{
      id: string | null;
      unitOfMeasureId: string;
      conversionFactor: string;
      sellingPrice: string;
      costPrice: string;
      isActive: boolean;
    }>;

    const requests: Observable<unknown>[] = rows.map((row) => {
      const body: CreateProductUnitRequest = {
        unitOfMeasureId: row.unitOfMeasureId,
        conversionFactor: String(row.conversionFactor).trim(),
        sellingPrice: String(row.sellingPrice).trim(),
        costPrice: String(row.costPrice).trim(),
        isActive: !!row.isActive,
      };
      return row.id
        ? this.products.updateUnit(productId, row.id, body)
        : this.products.createUnit(productId, body);
    });

    for (const unitId of this.removedUnitIds) {
      requests.push(this.products.deleteUnit(productId, unitId));
    }

    return forkJoin(requests);
  }

  loadLookups(): void {
    forkJoin({
      categories: this.categoryService.list(),
      units: this.unitService.list(),
      attributes: this.attributeService.list(),
    }).subscribe({
      next: ({ categories, units, attributes }) => {
        this.categories = categories.items ?? [];
        this.units = units.items ?? [];
        this.attributes = (attributes.items ?? []).filter((a) => a.isActive);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load product lookups'));
        this.cdr.detectChanges();
      },
    });
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.products.list().subscribe({
      next: (res) => {
        this.items = res.items ?? [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load products');
        this.cdr.detectChanges();
      },
    });
  }

  openCreate(): void {
    if (!this.canCreate) {
      return;
    }
    this.editing = null;
    this.form.reset({
      sku: '',
      name: '',
      description: '',
      categoryId: '',
      unitOfMeasureId: '',
      sellingPrice: '',
      costPrice: '',
      isActive: true,
      productType: 'GOODS',
      trackInventory: true,
      barcode: '',
      note: '',
      templateProductId: '',
    });
    this.selectedAttributeValueIds = [];
    this.additionalUnits.clear();
    this.removedUnitIds = [];
    this.modalRef = this.modal.open(this.formModal, {
      centered: true,
      size: 'lg',
    });
  }

  openEdit(item: Product): void {
    if (!this.canUpdate) {
      return;
    }
    this.editing = item;
    this.form.reset({
      sku: item.sku,
      name: item.name,
      description: item.description ?? '',
      categoryId: item.categoryId,
      unitOfMeasureId: item.unitOfMeasureId,
      sellingPrice: item.sellingPrice,
      costPrice: item.costPrice,
      isActive: item.isActive,
      productType: item.productType,
      trackInventory: item.trackInventory,
      barcode: item.barcode ?? '',
      note: item.note ?? '',
      templateProductId: item.templateProductId ?? '',
    });
    this.selectedAttributeValueIds = item.attributeValues.map((av) => av.id);
    this.additionalUnits.clear();
    this.removedUnitIds = [];
    this.modalRef = this.modal.open(this.formModal, {
      centered: true,
      size: 'lg',
    });

    this.loadingUnits = true;
    this.products.listUnits(item.id).subscribe({
      next: (res) => {
        for (const unit of res.items ?? []) {
          this.additionalUnits.push(this.createUnitGroup(unit));
        }
        this.loadingUnits = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loadingUnits = false;
        this.toast.error(apiErrorMessage(err, 'Failed to load additional units'));
        this.cdr.detectChanges();
      },
    });
  }

  openDetail(item: Product): void {
    this.viewing = item;
    this.viewingUnits = [];
    this.viewingUnitsLoading = true;
    this.modal.open(this.detailModal, { centered: true, size: 'lg' });
    this.products.listUnits(item.id).subscribe({
      next: (res) => {
        this.viewingUnits = res.items ?? [];
        this.viewingUnitsLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.viewingUnitsLoading = false;
        this.toast.error(apiErrorMessage(err, 'Failed to load additional units'));
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
    const unitsError = this.validateAdditionalUnits(value.unitOfMeasureId!);
    if (unitsError) {
      this.toast.error(unitsError);
      return;
    }
    const attributeValueIds = this.selectedAttributeValueIds;
    this.saving = true;
    this.cdr.detectChanges();

    // Editing an existing product always submits a definite answer for
    // these fields — empty means "clear it", so they're sent as explicit
    // `null` rather than omitted, per the PATCH contract (absent = leave
    // unchanged, null = clear, value = set). Creating has nothing to clear,
    // so empty stays omitted as before.
    const request$ = this.editing
      ? this.products.update(this.editing.id, {
          sku: value.sku!.trim(),
          name: value.name!.trim(),
          description: value.description?.trim() || null,
          categoryId: value.categoryId!,
          unitOfMeasureId: value.unitOfMeasureId!,
          sellingPrice: String(value.sellingPrice!).trim(),
          costPrice: String(value.costPrice!).trim(),
          isActive: !!value.isActive,
          productType: value.productType!,
          trackInventory: !!value.trackInventory,
          barcode: value.barcode?.trim() || null,
          note: value.note?.trim() || null,
          templateProductId: value.templateProductId?.trim() || null,
          attributeValueIds,
        })
      : this.products.create({
          sku: value.sku!.trim(),
          name: value.name!.trim(),
          description: value.description?.trim() || undefined,
          categoryId: value.categoryId!,
          unitOfMeasureId: value.unitOfMeasureId!,
          sellingPrice: String(value.sellingPrice!).trim(),
          costPrice: String(value.costPrice!).trim(),
          productType: value.productType!,
          trackInventory: !!value.trackInventory,
          barcode: value.barcode?.trim() || undefined,
          note: value.note?.trim() || undefined,
          templateProductId: value.templateProductId?.trim() || undefined,
          attributeValueIds,
        });

    request$.subscribe({
      next: (product) => {
        this.syncProductUnits(product.id).subscribe({
          next: () => {
            this.saving = false;
            this.modalRef?.close();
            this.toast.success(this.editing ? 'Product updated' : 'Product created');
            this.load();
            this.cdr.detectChanges();
          },
          error: (err) => {
            this.saving = false;
            this.modalRef?.close();
            this.toast.error(
              apiErrorMessage(
                err,
                'Product saved, but some additional units failed to save',
              ),
            );
            this.load();
            this.cdr.detectChanges();
          },
        });
      },
      error: (err) => {
        this.saving = false;
        this.toast.error(apiErrorMessage(err, 'Save failed'));
        this.cdr.detectChanges();
      },
    });
  }
}
