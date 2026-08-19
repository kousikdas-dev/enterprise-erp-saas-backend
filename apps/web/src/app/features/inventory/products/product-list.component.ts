import {
  Component,
  OnInit,
  TemplateRef,
  ViewChild,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { forkJoin } from 'rxjs';
import { AppPermissions } from '../../../core/permissions/permissions.constants';
import { PermissionService } from '../../../core/permissions/permission.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { CategoryService } from '../categories/category.service';
import {
  Category,
  Product,
  Unit,
} from '../models/inventory.models';
import { UnitService } from '../units/unit.service';
import { ProductService } from './product.service';

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
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canCreate = this.permissions.has(AppPermissions.PRODUCTS_CREATE);
  readonly canUpdate = this.permissions.has(AppPermissions.PRODUCTS_UPDATE);

  items: Product[] = [];
  categories: Category[] = [];
  units: Unit[] = [];
  loading = false;
  error: string | null = null;
  filter = '';
  saving = false;
  editing: Product | null = null;
  viewing: Product | null = null;
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
  });

  ngOnInit(): void {
    this.loadLookups();
    this.load();
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
        (p.description ?? '').toLowerCase().includes(q),
    );
  }

  categoryName(id: string): string {
    return this.categories.find((c) => c.id === id)?.name ?? id.slice(0, 8);
  }

  unitLabel(id: string): string {
    const unit = this.units.find((u) => u.id === id);
    return unit ? `${unit.code} — ${unit.name}` : id.slice(0, 8);
  }

  loadLookups(): void {
    forkJoin({
      categories: this.categoryService.list(),
      units: this.unitService.list(),
    }).subscribe({
      next: ({ categories, units }) => {
        this.categories = categories.items ?? [];
        this.units = units.items ?? [];
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
    });
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
    });
    this.modalRef = this.modal.open(this.formModal, {
      centered: true,
      size: 'lg',
    });
  }

  openDetail(item: Product): void {
    this.viewing = item;
    this.modal.open(this.detailModal, { centered: true, size: 'lg' });
  }

  save(): void {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const description = value.description?.trim() || undefined;
    this.saving = true;
    this.cdr.detectChanges();

    const request$ = this.editing
      ? this.products.update(this.editing.id, {
          sku: value.sku!.trim(),
          name: value.name!.trim(),
          description,
          categoryId: value.categoryId!,
          unitOfMeasureId: value.unitOfMeasureId!,
          sellingPrice: String(value.sellingPrice!).trim(),
          costPrice: String(value.costPrice!).trim(),
          isActive: !!value.isActive,
        })
      : this.products.create({
          sku: value.sku!.trim(),
          name: value.name!.trim(),
          description,
          categoryId: value.categoryId!,
          unitOfMeasureId: value.unitOfMeasureId!,
          sellingPrice: String(value.sellingPrice!).trim(),
          costPrice: String(value.costPrice!).trim(),
        });

    request$.subscribe({
      next: () => {
        this.saving = false;
        this.modalRef?.close();
        this.toast.success(this.editing ? 'Product updated' : 'Product created');
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
