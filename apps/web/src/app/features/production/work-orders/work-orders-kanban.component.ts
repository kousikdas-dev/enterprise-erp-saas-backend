import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { forkJoin } from 'rxjs';
import { ToastService } from '../../../shared/toast/toast.service';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { WorkCentre, WorkOrder } from '../models/production.models';
import { WorkCentreService } from '../work-centres/work-centre.service';
import { WorkOrderService } from './work-order.service';

const OPEN_STATUSES = ['PENDING', 'BLOCKED', 'IN_PROGRESS'];

@Component({
  selector: 'app-work-orders-kanban',
  templateUrl: './work-orders-kanban.component.html',
  styleUrls: ['./work-orders-kanban.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class WorkOrdersKanbanComponent implements OnInit {
  private readonly workCentreService = inject(WorkCentreService);
  private readonly workOrderService = inject(WorkOrderService);
  private readonly toast = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef);

  workCentres: WorkCentre[] = [];
  workOrders: WorkOrder[] = [];
  loading = false;
  error: string | null = null;

  showOpenOnly = true;
  showPlannedOnly = true;
  searchTerm = '';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    forkJoin({
      workCentres: this.workCentreService.list(),
      workOrders: this.workOrderService.list({ pageSize: 500 }),
    }).subscribe({
      next: ({ workCentres, workOrders }) => {
        this.workCentres = (workCentres.items ?? []).filter((w) => w.isActive);
        this.workOrders = workOrders.items ?? [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load the planning board');
        this.cdr.detectChanges();
      },
    });
  }

  toggleOpenOnly(): void {
    this.showOpenOnly = !this.showOpenOnly;
  }

  togglePlannedOnly(): void {
    this.showPlannedOnly = !this.showPlannedOnly;
  }

  get filteredWorkOrders(): WorkOrder[] {
    const term = this.searchTerm.trim().toLowerCase();
    return this.workOrders.filter((wo) => {
      if (this.showOpenOnly && !OPEN_STATUSES.includes(wo.status)) {
        return false;
      }
      if (this.showPlannedOnly && !wo.scheduledStartDate) {
        return false;
      }
      if (!term) {
        return true;
      }
      return (
        wo.workOrderNumber.toLowerCase().includes(term) ||
        wo.productionOrderNumber.toLowerCase().includes(term) ||
        wo.productName.toLowerCase().includes(term) ||
        wo.operationName.toLowerCase().includes(term) ||
        wo.workCentreName.toLowerCase().includes(term)
      );
    });
  }

  columnWorkOrders(workCentreId: string): WorkOrder[] {
    return this.filteredWorkOrders.filter((wo) => wo.workCentreId === workCentreId);
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

  formatDuration(minutes: number): string {
    if (minutes < 60) {
      return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
  }

  onDrop(event: CdkDragDrop<WorkOrder[]>, targetWorkCentre: WorkCentre): void {
    const workOrder = event.item.data as WorkOrder;
    if (!workOrder || workOrder.workCentreId === targetWorkCentre.id) {
      return;
    }
    const previousWorkCentreId = workOrder.workCentreId;
    this.workOrders = this.workOrders.map((w) =>
      w.id === workOrder.id ? { ...w, workCentreId: targetWorkCentre.id } : w,
    );
    this.cdr.detectChanges();

    this.workOrderService.update(workOrder.id, { workCentreId: targetWorkCentre.id }).subscribe({
      next: (updated) => {
        this.workOrders = this.workOrders.map((w) => (w.id === updated.id ? updated : w));
        this.toast.success(`Moved to ${targetWorkCentre.name}`);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.workOrders = this.workOrders.map((w) =>
          w.id === workOrder.id ? { ...w, workCentreId: previousWorkCentreId } : w,
        );
        this.toast.error(apiErrorMessage(err, 'Failed to move work order'));
        this.cdr.detectChanges();
      },
    });
  }
}
