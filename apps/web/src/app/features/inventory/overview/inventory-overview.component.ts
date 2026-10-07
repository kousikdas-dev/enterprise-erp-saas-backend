import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { AppPermissions } from '../../../core/permissions/permissions.constants';
import { PermissionService } from '../../../core/permissions/permission.service';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { ProductService } from '../products/product.service';
import { WarehouseService } from '../warehouses/warehouse.service';
import { CategoryService } from '../categories/category.service';
import { OpeningStockService } from '../opening-stock/opening-stock.service';

@Component({
  selector: 'app-inventory-overview',
  templateUrl: './inventory-overview.component.html',
  styleUrls: ['./inventory-overview.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class InventoryOverviewComponent implements OnInit {
  private readonly productService = inject(ProductService);
  private readonly warehouseService = inject(WarehouseService);
  private readonly categoryService = inject(CategoryService);
  private readonly openingStockService = inject(OpeningStockService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canReadProducts = this.permissions.has(AppPermissions.PRODUCTS_READ);
  readonly canReadWarehouses = this.permissions.has(AppPermissions.WAREHOUSES_READ);
  readonly canReadCategories = this.permissions.has(AppPermissions.CATEGORIES_READ);
  readonly canReadOpeningStock = this.permissions.has(
    AppPermissions.OPENING_STOCK_READ,
  );

  loading = false;
  error: string | null = null;

  activeProductsCount = 0;
  warehousesCount = 0;
  categoriesCount = 0;
  draftOpeningStockCount = 0;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();

    forkJoin({
      products: this.canReadProducts ? this.productService.list() : of({ items: [] }),
      warehouses: this.canReadWarehouses
        ? this.warehouseService.list()
        : of({ items: [] }),
      categories: this.canReadCategories
        ? this.categoryService.list()
        : of({ items: [] }),
      openingStock: this.canReadOpeningStock
        ? this.openingStockService.list({ status: 'DRAFT' })
        : of({ items: [] }),
    }).subscribe({
      next: ({ products, warehouses, categories, openingStock }) => {
        this.activeProductsCount = products.items.filter((p) => p.isActive).length;
        this.warehousesCount = warehouses.items.length;
        this.categoriesCount = categories.items.length;
        this.draftOpeningStockCount = openingStock.items.length;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load inventory overview');
        this.cdr.detectChanges();
      },
    });
  }
}
