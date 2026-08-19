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
import { ProductService } from '../products/product.service';
import {
  Product,
  STOCK_ADJUSTMENT_TYPES,
  StockAdjustmentType,
  StockBalance,
  Warehouse,
} from '../models/inventory.models';
import { WarehouseService } from '../warehouses/warehouse.service';
import { StockService } from './stock.service';

@Component({
  selector: 'app-stock-list',
  templateUrl: './stock-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class StockListComponent implements OnInit {
  @ViewChild('adjustModal') adjustModal!: TemplateRef<unknown>;

  private readonly stock = inject(StockService);
  private readonly productService = inject(ProductService);
  private readonly warehouseService = inject(WarehouseService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canAdjust = this.permissions.has(AppPermissions.STOCK_ADJUST);
  readonly adjustmentTypes = STOCK_ADJUSTMENT_TYPES;

  items: StockBalance[] = [];
  products: Product[] = [];
  warehouses: Warehouse[] = [];
  loading = false;
  error: string | null = null;
  filterProductId = '';
  filterWarehouseId = '';
  saving = false;
  private modalRef?: NgbModalRef;

  form = this.fb.group({
    productId: ['', Validators.required],
    warehouseId: ['', Validators.required],
    type: ['ADJUSTMENT_IN' as StockAdjustmentType, Validators.required],
    quantity: ['', [Validators.required, Validators.pattern(/^\d+(\.\d+)?$/)]],
    reason: ['', Validators.maxLength(255)],
  });

  ngOnInit(): void {
    this.loadLookups();
    this.load();
  }

  productLabel(id: string): string {
    const p = this.products.find((x) => x.id === id);
    return p ? `${p.sku} — ${p.name}` : id.slice(0, 8);
  }

  warehouseLabel(id: string): string {
    const w = this.warehouses.find((x) => x.id === id);
    return w ? `${w.code} — ${w.name}` : id.slice(0, 8);
  }

  loadLookups(): void {
    forkJoin({
      products: this.productService.list(),
      warehouses: this.warehouseService.list(),
    }).subscribe({
      next: ({ products, warehouses }) => {
        this.products = products.items ?? [];
        this.warehouses = warehouses.items ?? [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load stock lookups'));
        this.cdr.detectChanges();
      },
    });
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.stock
      .list({
        productId: this.filterProductId || undefined,
        warehouseId: this.filterWarehouseId || undefined,
      })
      .subscribe({
        next: (res) => {
          this.items = res.items ?? [];
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.loading = false;
          this.error = apiErrorMessage(err, 'Failed to load stock');
          this.cdr.detectChanges();
        },
      });
  }

  openAdjust(row?: StockBalance): void {
    if (!this.canAdjust) {
      return;
    }
    this.form.reset({
      productId: row?.productId ?? '',
      warehouseId: row?.warehouseId ?? '',
      type: 'ADJUSTMENT_IN',
      quantity: '',
      reason: '',
    });
    this.modalRef = this.modal.open(this.adjustModal, { centered: true });
  }

  submitAdjust(): void {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const reason = value.reason?.trim() || undefined;
    this.saving = true;
    this.cdr.detectChanges();

    this.stock
      .adjust({
        productId: value.productId!,
        warehouseId: value.warehouseId!,
        type: value.type as StockAdjustmentType,
        quantity: String(value.quantity!).trim(),
        reason,
      })
      .subscribe({
        next: () => {
          this.saving = false;
          this.modalRef?.close();
          this.toast.success('Stock adjustment posted');
          this.load();
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          this.toast.error(apiErrorMessage(err, 'Adjustment failed'));
          this.cdr.detectChanges();
        },
      });
  }
}
