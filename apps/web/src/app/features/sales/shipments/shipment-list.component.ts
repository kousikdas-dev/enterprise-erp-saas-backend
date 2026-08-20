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
import { WarehouseService } from '../../inventory/warehouses/warehouse.service';
import { Warehouse } from '../../inventory/models/inventory.models';
import { ToastService } from '../../../shared/toast/toast.service';
import { isPositiveDecimal } from '../../../shared/utils/decimal.util';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { SalesOrder, SalesOrderItem, Shipment } from '../models/sales.models';
import { SalesOrderService } from '../sales-orders/sales-order.service';
import { ShipmentService } from './shipment.service';

@Component({
  selector: 'app-shipment-list',
  templateUrl: './shipment-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class ShipmentListComponent implements OnInit {
  @ViewChild('formModal') formModal!: TemplateRef<unknown>;
  @ViewChild('detailModal') detailModal!: TemplateRef<unknown>;

  private readonly shipments = inject(ShipmentService);
  private readonly orderService = inject(SalesOrderService);
  private readonly warehouseService = inject(WarehouseService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  /** Backend gates create + post with shipments.create / shipments.post. */
  readonly canCreate = this.permissions.has(AppPermissions.SHIPMENTS_CREATE);
  readonly canPost = this.permissions.has(AppPermissions.SHIPMENTS_POST);

  items: Shipment[] = [];
  orders: SalesOrder[] = [];
  warehouses: Warehouse[] = [];
  loading = false;
  error: string | null = null;
  filter = '';
  saving = false;
  postingId: string | null = null;
  viewing: Shipment | null = null;
  selectedOrder: SalesOrder | null = null;
  private modalRef?: NgbModalRef;

  form = this.fb.group({
    salesOrderId: ['', Validators.required],
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

  get shippableOrders(): SalesOrder[] {
    return this.orders.filter(
      (o) => o.status === 'CONFIRMED' || o.status === 'PARTIALLY_SHIPPED',
    );
  }

  get filtered(): Shipment[] {
    const q = this.filter.trim().toLowerCase();
    if (!q) {
      return this.items;
    }
    return this.items.filter((s) => {
      return (
        s.id.toLowerCase().includes(q) ||
        s.status.toLowerCase().includes(q) ||
        s.salesOrderId.toLowerCase().includes(q) ||
        this.warehouseLabel(s.warehouseId).toLowerCase().includes(q)
      );
    });
  }

  orderLabel(id: string): string {
    const o = this.orders.find((x) => x.id === id);
    if (!o) {
      return id.slice(0, 8) + '…';
    }
    return `${id.slice(0, 8)}… (${o.status}) — ${o.customerName}`;
  }

  warehouseLabel(id: string): string {
    const w = this.warehouses.find((x) => x.id === id);
    return w ? `${w.code} — ${w.name}` : id.slice(0, 8);
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
      warehouses: this.warehouseService.list(),
    }).subscribe({
      next: ({ orders, warehouses }) => {
        this.orders = orders.items ?? [];
        this.warehouses = warehouses.items ?? [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load shipment lookups'));
        this.cdr.detectChanges();
      },
    });
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.shipments.list().subscribe({
      next: (res) => {
        this.items = res.items ?? [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load shipments');
        this.cdr.detectChanges();
      },
    });
  }

  openCreate(): void {
    if (!this.canCreate) {
      return;
    }
    this.selectedOrder = null;
    this.form.reset({ salesOrderId: '', warehouseId: '' });
    this.lines.clear();
    this.modalRef = this.modal.open(this.formModal, { centered: true, size: 'lg' });
  }

  onSalesOrderChange(orderId: string): void {
    const order = this.orders.find((o) => o.id === orderId) ?? null;
    this.selectedOrder = order;
    this.lines.clear();
    if (!order) {
      return;
    }
    for (const item of order.items) {
      if (!isPositiveDecimal(item.remainingQuantity)) {
        continue;
      }
      this.lines.push(
        this.fb.group({
          salesOrderItemId: [item.id, Validators.required],
          include: [true],
          quantity: [
            item.remainingQuantity,
            [Validators.required, Validators.pattern(/^\d+(\.\d{1,6})?$/)],
          ],
          maxRemaining: [item.remainingQuantity],
          productId: [item.productId],
        }),
      );
    }
    this.cdr.detectChanges();
  }

  lineProduct(salesOrderItemId: string): SalesOrderItem | undefined {
    return this.selectedOrder?.items.find((i) => i.id === salesOrderItemId);
  }

  openDetail(shipment: Shipment): void {
    this.viewing = shipment;
    this.modal.open(this.detailModal, { centered: true, size: 'lg' });
    this.shipments.getById(shipment.id).subscribe({
      next: (detail) => {
        this.viewing = detail;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load shipment details'));
        this.cdr.detectChanges();
      },
    });
  }

  postShipment(shipment: Shipment): void {
    if (!this.canPost || shipment.status !== 'PENDING_STOCK' || this.postingId) {
      return;
    }
    this.postingId = shipment.id;
    this.cdr.detectChanges();
    this.shipments.post(shipment.id).subscribe({
      next: (updated) => {
        this.postingId = null;
        this.toast.success(
          updated.status === 'POSTED'
            ? 'Shipment posted to inventory'
            : `Shipment status: ${updated.status}`,
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
      salesOrderItemId: string;
      include: boolean;
      quantity: string;
    }>;
    const items = raw
      .filter((line) => line.include)
      .map((line) => ({
        salesOrderItemId: line.salesOrderItemId,
        quantity: String(line.quantity).trim(),
      }));

    if (items.length === 0) {
      this.toast.error('Select at least one line with a quantity to ship.');
      return;
    }
    for (const line of items) {
      if (!isPositiveDecimal(line.quantity)) {
        this.toast.error('Shipped quantities must be positive decimals.');
        return;
      }
    }

    const value = this.form.getRawValue();
    this.saving = true;
    this.cdr.detectChanges();

    this.shipments
      .create({
        salesOrderId: value.salesOrderId!,
        warehouseId: value.warehouseId!,
        items,
      })
      .subscribe({
        next: (created) => {
          this.saving = false;
          this.modalRef?.close();
          if (created.status === 'POSTED') {
            this.toast.success('Shipment created and posted to inventory');
          } else if (created.status === 'PENDING_STOCK') {
            this.toast.warning(
              'Inventory posting is pending. You can retry posting this shipment.',
            );
          } else {
            this.toast.success(`Shipment created (${created.status})`);
          }
          this.load();
          this.loadLookups();
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          this.toast.error(apiErrorMessage(err, 'Create shipment failed'));
          this.cdr.detectChanges();
        },
      });
  }
}
