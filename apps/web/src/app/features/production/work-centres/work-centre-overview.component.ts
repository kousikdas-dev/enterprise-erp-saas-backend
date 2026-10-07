import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { forkJoin } from 'rxjs';
import { AppPermissions } from '../../../core/permissions/permissions.constants';
import { PermissionService } from '../../../core/permissions/permission.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { WorkCentre } from '../models/production.models';
import { ProductionOrderService } from '../production-orders/production-order.service';
import { WorkCentreService } from './work-centre.service';

@Component({
  selector: 'app-work-centre-overview',
  templateUrl: './work-centre-overview.component.html',
  styleUrls: ['./work-centre-overview.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class WorkCentreOverviewComponent implements OnInit {
  private readonly workCentres = inject(WorkCentreService);
  private readonly productionOrders = inject(ProductionOrderService);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canActivate = this.permissions.has(
    AppPermissions.PRODUCTION_WORK_CENTRES_ACTIVATE,
  );
  readonly canDeactivate = this.permissions.has(
    AppPermissions.PRODUCTION_WORK_CENTRES_DEACTIVATE,
  );

  items: WorkCentre[] = [];
  openProductionOrders = 0;
  loading = false;
  error: string | null = null;
  /** id of the work centre whose activate/deactivate call is in flight — disables only that card's toggle. */
  busyId: string | null = null;

  get activeCount(): number {
    return this.items.filter((w) => w.isActive).length;
  }

  get inactiveCount(): number {
    return this.items.length - this.activeCount;
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();

    forkJoin({
      workCentres: this.workCentres.list(),
      released: this.productionOrders.list({ status: 'RELEASED', pageSize: 1 }),
      inProgress: this.productionOrders.list({
        status: 'IN_PROGRESS',
        pageSize: 1,
      }),
    }).subscribe({
      next: ({ workCentres, released, inProgress }) => {
        this.items = workCentres.items ?? [];
        this.openProductionOrders = released.total + inProgress.total;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load work centres');
        this.cdr.detectChanges();
      },
    });
  }

  canToggle(workCentre: WorkCentre): boolean {
    return workCentre.isActive ? this.canDeactivate : this.canActivate;
  }

  toggle(workCentre: WorkCentre): void {
    if (!this.canToggle(workCentre) || this.busyId) {
      return;
    }
    this.busyId = workCentre.id;
    this.cdr.detectChanges();
    const request$ = workCentre.isActive
      ? this.workCentres.deactivate(workCentre.id)
      : this.workCentres.activate(workCentre.id);
    request$.subscribe({
      next: (updated) => {
        this.busyId = null;
        const index = this.items.findIndex((w) => w.id === updated.id);
        if (index !== -1) {
          this.items[index] = updated;
        }
        this.toast.success(
          updated.isActive ? 'Work centre activated' : 'Work centre deactivated',
        );
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.busyId = null;
        this.toast.error(apiErrorMessage(err, 'Action failed'));
        this.cdr.detectChanges();
      },
    });
  }
}
