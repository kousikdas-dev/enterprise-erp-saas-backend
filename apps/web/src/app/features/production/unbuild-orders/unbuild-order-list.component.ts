import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  TemplateRef,
  ViewChild,
  inject,
} from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { AppPermissions } from '../../../core/permissions/permissions.constants';
import { PermissionService } from '../../../core/permissions/permission.service';
import { Warehouse } from '../../inventory/models/inventory.models';
import { WarehouseService } from '../../inventory/warehouses/warehouse.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import {
  UNBUILD_ORDER_STATUSES,
  UnbuildOrder,
  UnbuildOrderStatus,
} from '../models/production.models';
import { UnbuildOrderService } from './unbuild-order.service';

type PendingActionType = 'complete' | 'cancel';

@Component({
  selector: 'app-unbuild-order-list',
  templateUrl: './unbuild-order-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class UnbuildOrderListComponent implements OnInit {
  @ViewChild('confirmModal') confirmModal!: TemplateRef<unknown>;

  private readonly unbuildOrders = inject(UnbuildOrderService);
  private readonly warehouseService = inject(WarehouseService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canCreate = this.permissions.has(AppPermissions.PRODUCTION_UNBUILD_ORDERS_CREATE);
  readonly canUpdate = this.permissions.has(AppPermissions.PRODUCTION_UNBUILD_ORDERS_UPDATE);
  readonly canComplete = this.permissions.has(AppPermissions.PRODUCTION_UNBUILD_ORDERS_COMPLETE);
  readonly canCancel = this.permissions.has(AppPermissions.PRODUCTION_UNBUILD_ORDERS_CANCEL);

  readonly statuses: readonly UnbuildOrderStatus[] = UNBUILD_ORDER_STATUSES;

  items: UnbuildOrder[] = [];
  warehouses: Warehouse[] = [];
  loading = false;
  error: string | null = null;

  search = '';
  filterStatus = '';
  page = 1;
  pageSize = 20;
  total = 0;

  pendingAction: { type: PendingActionType; order: UnbuildOrder } | null = null;
  actionBusy = false;

  ngOnInit(): void {
    this.warehouseService.list().subscribe({
      next: (res) => {
        this.warehouses = res.items ?? [];
        this.cdr.detectChanges();
      },
      error: () => undefined,
    });
    this.load();
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.unbuildOrders
      .list({
        search: this.search.trim() || undefined,
        status: (this.filterStatus || undefined) as UnbuildOrderStatus | undefined,
        page: this.page,
        pageSize: this.pageSize,
      })
      .subscribe({
        next: (res) => {
          this.items = res.items ?? [];
          this.total = res.total ?? 0;
          this.page = res.page ?? this.page;
          this.pageSize = res.pageSize ?? this.pageSize;
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.loading = false;
          this.error = apiErrorMessage(err, 'Failed to load unbuild orders');
          this.cdr.detectChanges();
        },
      });
  }

  search$(): void {
    this.page = 1;
    this.load();
  }

  clearFilters(): void {
    this.search = '';
    this.filterStatus = '';
    this.page = 1;
    this.load();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.page) {
      return;
    }
    this.page = page;
    this.load();
  }

  warehouseLabel(id: string): string {
    const w = this.warehouses.find((x) => x.id === id);
    return w ? `${w.code} — ${w.name}` : id.slice(0, 8);
  }

  statusBadgeClass(status: string): string {
    switch (status) {
      case 'DRAFT':
        return 'bg-secondary';
      case 'PROCESSING':
        return 'bg-warning text-dark';
      case 'DONE':
        return 'bg-success';
      case 'CANCELLED':
        return 'bg-dark';
      default:
        return 'bg-secondary';
    }
  }

  askComplete(order: UnbuildOrder): void {
    this.pendingAction = { type: 'complete', order };
    this.modal.open(this.confirmModal, { centered: true });
  }

  askCancel(order: UnbuildOrder): void {
    this.pendingAction = { type: 'cancel', order };
    this.modal.open(this.confirmModal, { centered: true });
  }

  confirmActionLabel(type: PendingActionType | undefined): string {
    switch (type) {
      case 'complete':
        return 'Complete';
      case 'cancel':
        return 'Cancel Order';
      default:
        return 'Confirm';
    }
  }

  runPendingAction(modal: { close: () => void }): void {
    if (!this.pendingAction || this.actionBusy) {
      return;
    }
    const { type, order } = this.pendingAction;
    this.actionBusy = true;
    this.cdr.detectChanges();

    const request$ =
      type === 'complete' ? this.unbuildOrders.complete(order.id) : this.unbuildOrders.cancel(order.id);

    request$.subscribe({
      next: (updated) => {
        this.actionBusy = false;
        modal.close();
        this.pendingAction = null;
        this.items = this.items.map((o) => (o.id === updated.id ? updated : o));
        this.toast.success(type === 'complete' ? 'Unbuild order completed' : 'Unbuild order cancelled');
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.actionBusy = false;
        modal.close();
        this.pendingAction = null;
        // A completion failure may be ambiguous (the posting could have
        // already committed on the server even though this response
        // failed) — reload this one row from the server rather than
        // trusting the error alone, and only report what actually
        // happened.
        if (type === 'complete') {
          this.unbuildOrders.getById(order.id).subscribe({
            next: (reloaded) => {
              this.items = this.items.map((o) => (o.id === reloaded.id ? reloaded : o));
              if (reloaded.status === 'DONE') {
                this.toast.success('Unbuild order completed');
              } else {
                this.toast.error(apiErrorMessage(err, 'Completion could not be confirmed'));
              }
              this.cdr.detectChanges();
            },
            error: () => {
              this.toast.error(
                apiErrorMessage(err, "Completion could not be confirmed; refresh to check this order's status"),
              );
              this.cdr.detectChanges();
            },
          });
        } else {
          this.toast.error(apiErrorMessage(err, 'Action failed'));
        }
        this.cdr.detectChanges();
      },
    });
  }
}
