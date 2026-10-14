import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { forkJoin } from 'rxjs';
import { ToastService } from '../../../shared/toast/toast.service';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { WorkCentre, WorkOrder } from '../models/production.models';
import { WorkCentreService } from '../work-centres/work-centre.service';
import { WorkOrderService } from './work-order.service';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface PlanningDay {
  date: Date;
  isToday: boolean;
  monthLabel: string | null;
}

interface PlanningBar {
  workOrder: WorkOrder;
  startCol: number;
  span: number;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dayDiff(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / MS_PER_DAY);
}

@Component({
  selector: 'app-work-orders-planning',
  templateUrl: './work-orders-planning.component.html',
  styleUrls: ['./work-orders-planning.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class WorkOrdersPlanningComponent implements OnInit {
  private readonly workCentreService = inject(WorkCentreService);
  private readonly workOrderService = inject(WorkOrderService);
  private readonly toast = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef);

  workCentres: WorkCentre[] = [];
  /** All work orders, unscheduled included — source for counts/indicators. */
  allWorkOrders: WorkOrder[] = [];
  /** Scheduled-only subset — what the Gantt bars are drawn from. */
  workOrders: WorkOrder[] = [];
  loading = false;
  error: string | null = null;
  searchTerm = '';

  rangeStart: Date = this.firstOfMonth(new Date());
  days: PlanningDay[] = [];

  ngOnInit(): void {
    this.buildDays();
    this.load();
  }

  private firstOfMonth(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  private buildDays(): void {
    const year = this.rangeStart.getFullYear();
    const month = this.rangeStart.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = startOfDay(new Date());
    const days: PlanningDay[] = [];
    for (let i = 0; i < daysInMonth; i += 1) {
      const date = new Date(year, month, i + 1);
      days.push({
        date,
        isToday: date.getTime() === today.getTime(),
        monthLabel: i === 0 ? date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : null,
      });
    }
    this.days = days;
  }

  get rangeLabel(): string {
    return this.rangeStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  prevMonth(): void {
    this.rangeStart = new Date(this.rangeStart.getFullYear(), this.rangeStart.getMonth() - 1, 1);
    this.buildDays();
  }

  nextMonth(): void {
    this.rangeStart = new Date(this.rangeStart.getFullYear(), this.rangeStart.getMonth() + 1, 1);
    this.buildDays();
  }

  goToday(): void {
    this.rangeStart = this.firstOfMonth(new Date());
    this.buildDays();
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
        this.allWorkOrders = workOrders.items ?? [];
        this.workOrders = this.allWorkOrders.filter((w) => !!w.scheduledStartDate);
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

  private matchesSearch(wo: WorkOrder): boolean {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) return true;
    return (
      wo.workOrderNumber.toLowerCase().includes(term) ||
      wo.productionOrderNumber.toLowerCase().includes(term) ||
      wo.productName.toLowerCase().includes(term) ||
      wo.operationName.toLowerCase().includes(term)
    );
  }

  private workOrdersForCentre(workCentreId: string): WorkOrder[] {
    return this.workOrders.filter((w) => w.workCentreId === workCentreId && this.matchesSearch(w));
  }

  /** Whether this Work Centre has any BLOCKED work order, regardless of the currently viewed month. */
  hasBlocked(workCentreId: string): boolean {
    return this.allWorkOrders.some((w) => w.workCentreId === workCentreId && w.status === 'BLOCKED');
  }

  /** Work orders that still need a schedule: active but no scheduledStartDate yet. */
  get unscheduledCount(): number {
    return this.allWorkOrders.filter(
      (w) => !w.scheduledStartDate && w.status !== 'DONE' && w.status !== 'CANCELLED',
    ).length;
  }

  /** Total planned hours for this work centre's bars that fall within the visible month. */
  hoursForCentre(workCentreId: string): number {
    const rangeEnd = this.days.length ? this.days[this.days.length - 1].date : this.rangeStart;
    const minutes = this.workOrdersForCentre(workCentreId)
      .filter((w) => this.barFor(w, rangeEnd) !== null)
      .reduce((sum, w) => sum + w.plannedDurationMinutes, 0);
    return Math.round((minutes / 60) * 10) / 10;
  }

  /** Computes the visible grid position for a work order's bar, or null if it doesn't overlap the visible month at all. */
  private barFor(wo: WorkOrder, rangeEndDate: Date): PlanningBar | null {
    if (!wo.scheduledStartDate) return null;
    const start = new Date(wo.scheduledStartDate);
    const end = wo.scheduledEndDate ? new Date(wo.scheduledEndDate) : start;
    if (startOfDay(end) < this.rangeStart || startOfDay(start) > rangeEndDate) {
      return null;
    }
    const rawStartCol = dayDiff(start, this.rangeStart);
    const rawEndCol = dayDiff(end, this.rangeStart);
    const startCol = Math.max(0, rawStartCol);
    const endCol = Math.min(this.days.length - 1, rawEndCol);
    return { workOrder: wo, startCol, span: Math.max(1, endCol - startCol + 1) };
  }

  /** Greedy interval-lane assignment so overlapping bars stack into separate rows instead of colliding. */
  lanesForCentre(workCentreId: string): PlanningBar[][] {
    const rangeEnd = this.days.length ? this.days[this.days.length - 1].date : this.rangeStart;
    const bars = this.workOrdersForCentre(workCentreId)
      .map((w) => this.barFor(w, rangeEnd))
      .filter((b): b is PlanningBar => b !== null)
      .sort((a, b) => a.startCol - b.startCol);

    const lanes: PlanningBar[][] = [];
    for (const bar of bars) {
      let placed = false;
      for (const lane of lanes) {
        const last = lane[lane.length - 1];
        if (last.startCol + last.span <= bar.startCol) {
          lane.push(bar);
          placed = true;
          break;
        }
      }
      if (!placed) {
        lanes.push([bar]);
      }
    }
    return lanes.length ? lanes : [[]];
  }

  statusBarClass(status: string): string {
    switch (status) {
      case 'PENDING':
        return 'bg-secondary';
      case 'IN_PROGRESS':
        return 'bg-warning';
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

  barTitle(wo: WorkOrder): string {
    return `${wo.productName} — ${wo.operationName} (${wo.productionOrderNumber})`;
  }
}
