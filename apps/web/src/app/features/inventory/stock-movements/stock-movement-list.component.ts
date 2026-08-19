import {
  Component,
  OnInit,
  TemplateRef,
  ViewChild,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { forkJoin } from 'rxjs';
import { ToastService } from '../../../shared/toast/toast.service';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { ProductService } from '../products/product.service';
import {
  Product,
  STOCK_MOVEMENT_TYPES,
  StockMovement,
  StockMovementType,
  Warehouse,
} from '../models/inventory.models';
import { WarehouseService } from '../warehouses/warehouse.service';
import { StockMovementService } from './stock-movement.service';

@Component({
  selector: 'app-stock-movement-list',
  templateUrl: './stock-movement-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class StockMovementListComponent implements OnInit {
  @ViewChild('detailModal') detailModal!: TemplateRef<unknown>;

  private readonly movements = inject(StockMovementService);
  private readonly productService = inject(ProductService);
  private readonly warehouseService = inject(WarehouseService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly movementTypes = STOCK_MOVEMENT_TYPES;

  items: StockMovement[] = [];
  products: Product[] = [];
  warehouses: Warehouse[] = [];
  loading = false;
  error: string | null = null;
  detailLoading = false;
  viewing: StockMovement | null = null;

  filterProductId = '';
  filterWarehouseId = '';
  filterType: StockMovementType | '' = '';
  filterFrom = '';
  filterTo = '';

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

  typeBadgeClass(type: StockMovementType): string {
    switch (type) {
      case 'PURCHASE':
      case 'OPENING':
      case 'ADJUSTMENT_IN':
      case 'TRANSFER_IN':
        return 'bg-success';
      case 'SALE':
      case 'ADJUSTMENT_OUT':
      case 'TRANSFER_OUT':
        return 'bg-warning text-dark';
      default:
        return 'bg-secondary';
    }
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
        this.toast.error(apiErrorMessage(err, 'Failed to load movement lookups'));
        this.cdr.detectChanges();
      },
    });
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    const from = this.filterFrom
      ? new Date(this.filterFrom).toISOString()
      : undefined;
    const to = this.filterTo
      ? new Date(this.filterTo).toISOString()
      : undefined;

    this.movements
      .list({
        productId: this.filterProductId || undefined,
        warehouseId: this.filterWarehouseId || undefined,
        type: this.filterType || undefined,
        from,
        to,
      })
      .subscribe({
        next: (res) => {
          this.items = res.items ?? [];
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.loading = false;
          this.error = apiErrorMessage(err, 'Failed to load stock movements');
          this.cdr.detectChanges();
        },
      });
  }

  openDetail(item: StockMovement): void {
    this.viewing = item;
    this.detailLoading = true;
    this.modal.open(this.detailModal, { centered: true, size: 'lg' });
    this.cdr.detectChanges();
    this.movements.getById(item.id).subscribe({
      next: (detail) => {
        this.viewing = detail;
        this.detailLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.detailLoading = false;
        this.toast.error(apiErrorMessage(err, 'Failed to load movement details'));
        this.cdr.detectChanges();
      },
    });
  }
}
