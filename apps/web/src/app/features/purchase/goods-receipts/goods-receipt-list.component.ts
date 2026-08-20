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
  FormArray,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { forkJoin } from 'rxjs';
import { AppPermissions } from '../../../core/permissions/permissions.constants';
import { PermissionService } from '../../../core/permissions/permission.service';
import { ProductService } from '../../inventory/products/product.service';
import { WarehouseService } from '../../inventory/warehouses/warehouse.service';
import { Product, Warehouse } from '../../inventory/models/inventory.models';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  formatQuantity,
  isPositiveDecimal,
  subtractDecimals,
} from '../../../shared/utils/decimal.util';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import {
  GoodsReceipt,
  PurchaseOrder,
  PurchaseOrderItem,
  Supplier,
} from '../models/purchase.models';
import { SupplierService } from '../suppliers/supplier.service';
import { PurchaseOrderService } from '../purchase-orders/purchase-order.service';
import { GoodsReceiptService } from './goods-receipt.service';

@Component({
  selector: 'app-goods-receipt-list',
  templateUrl: './goods-receipt-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class GoodsReceiptListComponent implements OnInit {
  @ViewChild('formModal') formModal!: TemplateRef<unknown>;
  @ViewChild('detailModal') detailModal!: TemplateRef<unknown>;

  private readonly receipts = inject(GoodsReceiptService);
  private readonly orderService = inject(PurchaseOrderService);
  private readonly supplierService = inject(SupplierService);
  private readonly warehouseService = inject(WarehouseService);
  private readonly productService = inject(ProductService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  /** Backend gates create + post with goods-receipts.create. */
  readonly canCreate = this.permissions.has(AppPermissions.GOODS_RECEIPTS_CREATE);
  readonly canPost = this.permissions.has(AppPermissions.GOODS_RECEIPTS_CREATE);

  items: GoodsReceipt[] = [];
  orders: PurchaseOrder[] = [];
  suppliers: Supplier[] = [];
  warehouses: Warehouse[] = [];
  products: Product[] = [];
  loading = false;
  error: string | null = null;
  filter = '';
  saving = false;
  postingId: string | null = null;
  viewing: GoodsReceipt | null = null;
  selectedOrder: PurchaseOrder | null = null;
  private modalRef?: NgbModalRef;

  form = this.fb.group({
    purchaseOrderId: ['', Validators.required],
    warehouseId: ['', Validators.required],
    items: this.fb.array([] as FormGroup[]),
  });

  ngOnInit(): void {
    this.loadLookups();
    this.load();
  }

  get lines(): FormArray {
    return this.form.get('items') as FormArray;
  }

  get receivableOrders(): PurchaseOrder[] {
    return this.orders.filter(
      (o) => o.status === 'CONFIRMED' || o.status === 'PARTIALLY_RECEIVED',
    );
  }

  get filtered(): GoodsReceipt[] {
    const q = this.filter.trim().toLowerCase();
    if (!q) {
      return this.items;
    }
    return this.items.filter((r) => {
      return (
        r.id.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q) ||
        r.purchaseOrderId.toLowerCase().includes(q) ||
        this.warehouseLabel(r.warehouseId).toLowerCase().includes(q)
      );
    });
  }

  supplierLabel(id: string): string {
    const s = this.suppliers.find((x) => x.id === id);
    return s ? `${s.code} — ${s.name}` : id.slice(0, 8);
  }

  warehouseLabel(id: string): string {
    const w = this.warehouses.find((x) => x.id === id);
    return w ? `${w.code} — ${w.name}` : id.slice(0, 8);
  }

  productLabel(id: string): string {
    const p = this.products.find((x) => x.id === id);
    return p ? `${p.sku} — ${p.name}` : id.slice(0, 8);
  }

  orderLabel(id: string): string {
    const o = this.orders.find((x) => x.id === id);
    if (!o) {
      return id.slice(0, 8) + '…';
    }
    return `${id.slice(0, 8)}… (${o.status}) — ${this.supplierLabel(o.supplierId)}`;
  }

  poItemProduct(poItemId: string, order?: PurchaseOrder | null): string {
    const source =
      order ??
      this.orders.find((o) => o.items.some((i) => i.id === poItemId)) ??
      null;
    const line = source?.items.find((i) => i.id === poItemId);
    return line ? this.productLabel(line.productId) : poItemId.slice(0, 8);
  }

  remainingFor(item: PurchaseOrderItem): string {
    return formatQuantity(subtractDecimals(item.quantity, item.receivedQuantity));
  }

  statusBadgeClass(status: string): string {
    if (status === 'POSTED') {
      return 'bg-success';
    }
    if (status === 'PENDING_STOCK') {
      return 'bg-warning text-dark';
    }
    return 'bg-secondary';
  }

  loadLookups(): void {
    forkJoin({
      orders: this.orderService.list(),
      suppliers: this.supplierService.list(),
      warehouses: this.warehouseService.list(),
      products: this.productService.list(),
    }).subscribe({
      next: ({ orders, suppliers, warehouses, products }) => {
        this.orders = orders.items ?? [];
        this.suppliers = suppliers.items ?? [];
        this.warehouses = warehouses.items ?? [];
        this.products = products.items ?? [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load receipt lookups'));
        this.cdr.detectChanges();
      },
    });
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.receipts.list().subscribe({
      next: (res) => {
        this.items = res.items ?? [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load goods receipts');
        this.cdr.detectChanges();
      },
    });
  }

  openCreate(): void {
    if (!this.canCreate) {
      return;
    }
    this.selectedOrder = null;
    this.form.reset({ purchaseOrderId: '', warehouseId: '' });
    this.lines.clear();
    this.modalRef = this.modal.open(this.formModal, {
      centered: true,
      size: 'lg',
    });
  }

  onPurchaseOrderChange(orderId: string): void {
    const order = this.orders.find((o) => o.id === orderId) ?? null;
    this.selectedOrder = order;
    this.lines.clear();
    if (!order) {
      return;
    }
    for (const item of order.items) {
      const remaining = this.remainingFor(item);
      if (!isPositiveDecimal(remaining)) {
        continue;
      }
      this.lines.push(
        this.fb.group({
          purchaseOrderItemId: [item.id, Validators.required],
          include: [true],
          quantity: [
            remaining,
            [Validators.required, Validators.pattern(/^\d+(\.\d{1,6})?$/)],
          ],
          maxRemaining: [remaining],
          productId: [item.productId],
        }),
      );
    }
    this.cdr.detectChanges();
  }

  openDetail(receipt: GoodsReceipt): void {
    this.viewing = receipt;
    this.modal.open(this.detailModal, { centered: true, size: 'lg' });
    this.receipts.getById(receipt.id).subscribe({
      next: (detail) => {
        this.viewing = detail;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load receipt details'));
        this.cdr.detectChanges();
      },
    });
  }

  postReceipt(receipt: GoodsReceipt): void {
    if (!this.canPost || receipt.status !== 'PENDING_STOCK' || this.postingId) {
      return;
    }
    this.postingId = receipt.id;
    this.cdr.detectChanges();
    this.receipts.post(receipt.id).subscribe({
      next: (updated) => {
        this.postingId = null;
        this.toast.success(
          updated.status === 'POSTED'
            ? 'Goods receipt posted to inventory'
            : `Receipt status: ${updated.status}`,
        );
        this.load();
        this.orderService.list().subscribe({
          next: (res) => {
            this.orders = res.items ?? [];
            this.cdr.detectChanges();
          },
        });
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.postingId = null;
        this.toast.error(apiErrorMessage(err, 'Posting failed'));
        this.cdr.detectChanges();
      },
    });
  }

  save(): void {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.lines.getRawValue() as Array<{
      purchaseOrderItemId: string;
      include: boolean;
      quantity: string;
    }>;
    const items = raw
      .filter((line) => line.include)
      .map((line) => ({
        purchaseOrderItemId: line.purchaseOrderItemId,
        quantity: String(line.quantity).trim(),
      }));

    if (items.length === 0) {
      this.toast.error('Select at least one line with a quantity to receive.');
      return;
    }
    for (const line of items) {
      if (!isPositiveDecimal(line.quantity)) {
        this.toast.error('Received quantities must be positive decimals.');
        return;
      }
    }

    const value = this.form.getRawValue();
    this.saving = true;
    this.cdr.detectChanges();

    this.receipts
      .create({
        purchaseOrderId: value.purchaseOrderId!,
        warehouseId: value.warehouseId!,
        items,
      })
      .subscribe({
        next: (created) => {
          this.saving = false;
          this.modalRef?.close();
          if (created.status === 'POSTED') {
            this.toast.success('Goods receipt created and posted to inventory');
          } else if (created.status === 'PENDING_STOCK') {
            this.toast.warning(
              'Inventory posting is pending. You can retry posting this receipt.',
            );
          } else {
            this.toast.success(`Goods receipt created (${created.status})`);
          }
          this.load();
          this.loadLookups();
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          this.toast.error(apiErrorMessage(err, 'Create receipt failed'));
          this.cdr.detectChanges();
        },
      });
  }
}
