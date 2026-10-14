import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { AppPermissions } from '../../../core/permissions/permissions.constants';
import { PermissionService } from '../../../core/permissions/permission.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { WORK_ORDER_STATUSES, WorkCentre, WorkOrder, WorkOrderStatus } from '../models/production.models';
import { WorkCentreService } from '../work-centres/work-centre.service';
import { WorkOrderService } from './work-order.service';

type WorkOrderActionType = 'start' | 'block' | 'unblock' | 'complete' | 'cancel';

@Component({
  selector: 'app-work-order-list',
  templateUrl: './work-order-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class WorkOrderListComponent implements OnInit {
  private readonly workOrders = inject(WorkOrderService);
  private readonly workCentreService = inject(WorkCentreService);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canStart = this.permissions.has(AppPermissions.PRODUCTION_WORK_ORDERS_START);
  readonly canBlock = this.permissions.has(AppPermissions.PRODUCTION_WORK_ORDERS_BLOCK);
  readonly canUnblock = this.permissions.has(AppPermissions.PRODUCTION_WORK_ORDERS_UNBLOCK);
  readonly canComplete = this.permissions.has(AppPermissions.PRODUCTION_WORK_ORDERS_COMPLETE);
  readonly canCancel = this.permissions.has(AppPermissions.PRODUCTION_WORK_ORDERS_CANCEL);

  readonly statuses: readonly WorkOrderStatus[] = WORK_ORDER_STATUSES;

  items: WorkOrder[] = [];
  workCentres: WorkCentre[] = [];
  loading = false;
  error: string | null = null;

  search = '';
  filterStatus = '';
  filterWorkCentreId = '';
  page = 1;
  pageSize = 20;
  total = 0;

  actionBusyId: string | null = null;

  ngOnInit(): void {
    this.workCentreService.list().subscribe({
      next: (res) => {
        this.workCentres = res.items ?? [];
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
    this.workOrders
      .list({
        search: this.search.trim() || undefined,
        status: (this.filterStatus || undefined) as WorkOrderStatus | undefined,
        workCentreId: this.filterWorkCentreId || undefined,
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
          this.error = apiErrorMessage(err, 'Failed to load work orders');
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
    this.filterWorkCentreId = '';
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

  statusBadgeClass(status: string): string {
    switch (status) {
      case 'PENDING':
        return 'bg-secondary';
      case 'IN_PROGRESS':
        return 'bg-warning text-dark';
      case 'BLOCKED':
        return 'bg-danger';
      case 'DONE':
        return 'bg-success';
      case 'CANCELLED':
        return 'bg-dark';
      default:
        return 'bg-secondary';
    }
  }

  runAction(item: WorkOrder, type: WorkOrderActionType): void {
    if (this.actionBusyId) {
      return;
    }
    this.actionBusyId = item.id;
    this.cdr.detectChanges();

    const request$ =
      type === 'start'
        ? this.workOrders.start(item.id)
        : type === 'block'
          ? this.workOrders.block(item.id)
          : type === 'unblock'
            ? this.workOrders.unblock(item.id)
            : type === 'complete'
              ? this.workOrders.complete(item.id)
              : this.workOrders.cancel(item.id);

    const successMessage: Record<WorkOrderActionType, string> = {
      start: 'Work order started',
      block: 'Work order blocked',
      unblock: 'Work order unblocked',
      complete: 'Work order completed',
      cancel: 'Work order cancelled',
    };

    request$.subscribe({
      next: (updated) => {
        this.actionBusyId = null;
        this.items = this.items.map((w) => (w.id === updated.id ? updated : w));
        this.toast.success(successMessage[type]);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.actionBusyId = null;
        this.toast.error(apiErrorMessage(err, 'Action failed'));
        this.cdr.detectChanges();
      },
    });
  }
}
