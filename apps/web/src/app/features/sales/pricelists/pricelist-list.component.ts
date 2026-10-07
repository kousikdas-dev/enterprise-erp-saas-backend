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
import { AppPermissions } from '../../../core/permissions/permissions.constants';
import { PermissionService } from '../../../core/permissions/permission.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { CategoryService } from '../../inventory/categories/category.service';
import { Category, Product } from '../../inventory/models/inventory.models';
import { ProductService } from '../../inventory/products/product.service';
import {
  PRICELIST_APPLY_ONS,
  PRICELIST_COMPUTE_METHODS,
  Pricelist,
  PricelistApplyOn,
  PricelistComputeMethod,
} from '../models/sales.models';
import { PricelistService } from './pricelist.service';

interface RuleRow {
  id?: string;
  applyOn: PricelistApplyOn;
  categoryId: string;
  productId: string;
  computeMethod: PricelistComputeMethod;
  fixedPrice: string;
  discountPercent: string;
  minQuantity: string;
  saving?: boolean;
}

function emptyRow(): RuleRow {
  return {
    applyOn: 'ALL_PRODUCTS',
    categoryId: '',
    productId: '',
    computeMethod: 'FIXED_PRICE',
    fixedPrice: '0',
    discountPercent: '0',
    minQuantity: '0',
  };
}

@Component({
  selector: 'app-pricelist-list',
  templateUrl: './pricelist-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class PricelistListComponent implements OnInit {
  @ViewChild('formModal') formModal!: TemplateRef<unknown>;

  private readonly pricelists = inject(PricelistService);
  private readonly categoriesService = inject(CategoryService);
  private readonly productsService = inject(ProductService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canCreate = this.permissions.has(AppPermissions.PRICELISTS_CREATE);
  readonly canUpdate = this.permissions.has(AppPermissions.PRICELISTS_UPDATE);

  readonly applyOns = PRICELIST_APPLY_ONS;
  readonly computeMethods = PRICELIST_COMPUTE_METHODS;

  items: Pricelist[] = [];
  categories: Category[] = [];
  products: Product[] = [];
  loading = false;
  error: string | null = null;
  filter = '';
  saving = false;
  editing: Pricelist | null = null;
  ruleRows: RuleRow[] = [];
  private modalRef?: NgbModalRef;

  form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    isActive: [true],
  });

  ngOnInit(): void {
    this.load();
    this.categoriesService.list().subscribe({
      next: (res) => (this.categories = res.items ?? []),
      error: () => undefined,
    });
    this.productsService.list().subscribe({
      next: (res) => (this.products = res.items ?? []),
      error: () => undefined,
    });
  }

  get filtered(): Pricelist[] {
    const q = this.filter.trim().toLowerCase();
    if (!q) {
      return this.items;
    }
    return this.items.filter((p) => p.name.toLowerCase().includes(q));
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.pricelists.list().subscribe({
      next: (res) => {
        this.items = res.items ?? [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load pricelists');
        this.cdr.detectChanges();
      },
    });
  }

  openCreate(): void {
    if (!this.canCreate) {
      return;
    }
    this.editing = null;
    this.ruleRows = [];
    this.form.reset({ name: '', isActive: true });
    this.modalRef = this.modal.open(this.formModal, { centered: true, size: 'xl' });
  }

  openEdit(item: Pricelist): void {
    if (!this.canUpdate) {
      return;
    }
    this.editing = item;
    this.loading = true;
    this.cdr.detectChanges();
    this.pricelists.getById(item.id).subscribe({
      next: (full) => {
        this.ruleRows = (full.items ?? []).map((r) => ({
          id: r.id,
          applyOn: r.applyOn,
          categoryId: r.categoryId ?? '',
          productId: r.productId ?? '',
          computeMethod: r.computeMethod,
          fixedPrice: r.fixedPrice ?? '0',
          discountPercent: r.discountPercent ?? '0',
          minQuantity: r.minQuantity,
        }));
        this.form.reset({ name: full.name, isActive: full.isActive });
        this.loading = false;
        this.modalRef = this.modal.open(this.formModal, { centered: true, size: 'xl' });
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.toast.error(apiErrorMessage(err, 'Failed to load pricelist'));
        this.cdr.detectChanges();
      },
    });
  }

  private rowPayload(row: RuleRow) {
    return {
      applyOn: row.applyOn,
      categoryId: row.applyOn === 'CATEGORY' ? row.categoryId || undefined : undefined,
      productId: row.applyOn === 'PRODUCT' ? row.productId || undefined : undefined,
      computeMethod: row.computeMethod,
      fixedPrice: row.computeMethod === 'FIXED_PRICE' ? row.fixedPrice : undefined,
      discountPercent:
        row.computeMethod === 'DISCOUNT_PERCENT' ? row.discountPercent : undefined,
      minQuantity: row.minQuantity,
    };
  }

  addRuleRow(): void {
    if (!this.editing) {
      this.ruleRows.push(emptyRow());
      this.cdr.detectChanges();
      return;
    }
    const row = emptyRow();
    row.saving = true;
    this.ruleRows.push(row);
    this.cdr.detectChanges();
    this.pricelists.addItem(this.editing.id, this.rowPayload(row)).subscribe({
      next: (created) => {
        row.id = created.id;
        row.saving = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.ruleRows = this.ruleRows.filter((r) => r !== row);
        this.toast.error(apiErrorMessage(err, 'Failed to add rule'));
        this.cdr.detectChanges();
      },
    });
  }

  saveRuleRow(row: RuleRow): void {
    if (!this.editing || !row.id) {
      return;
    }
    row.saving = true;
    this.cdr.detectChanges();
    this.pricelists.updateItem(this.editing.id, row.id, this.rowPayload(row)).subscribe({
      next: () => {
        row.saving = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        row.saving = false;
        this.toast.error(apiErrorMessage(err, 'Failed to save rule'));
        this.cdr.detectChanges();
      },
    });
  }

  removeRuleRow(row: RuleRow): void {
    if (this.editing && row.id) {
      this.pricelists.removeItem(this.editing.id, row.id).subscribe({
        next: () => {
          this.ruleRows = this.ruleRows.filter((r) => r !== row);
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.toast.error(apiErrorMessage(err, 'Failed to remove rule'));
          this.cdr.detectChanges();
        },
      });
      return;
    }
    this.ruleRows = this.ruleRows.filter((r) => r !== row);
    this.cdr.detectChanges();
  }

  save(): void {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.saving = true;
    this.cdr.detectChanges();

    const request$ = this.editing
      ? this.pricelists.update(this.editing.id, {
          name: value.name!.trim(),
          isActive: !!value.isActive,
        })
      : this.pricelists.create({
          name: value.name!.trim(),
          items: this.ruleRows.map((r) => this.rowPayload(r)),
        });

    request$.subscribe({
      next: () => {
        this.saving = false;
        this.modalRef?.close();
        this.toast.success(this.editing ? 'Pricelist updated' : 'Pricelist created');
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
