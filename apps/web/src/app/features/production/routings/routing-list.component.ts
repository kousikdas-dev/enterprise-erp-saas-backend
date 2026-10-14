import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { AppPermissions } from '../../../core/permissions/permissions.constants';
import { PermissionService } from '../../../core/permissions/permission.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { ROUTING_STATUSES, Routing, RoutingStatus } from '../models/production.models';
import { RoutingService } from './routing.service';

type RoutingActionType = 'activate' | 'deactivate' | 'new-version';

@Component({
  selector: 'app-routing-list',
  templateUrl: './routing-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class RoutingListComponent implements OnInit {
  private readonly routings = inject(RoutingService);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canCreate = this.permissions.has(AppPermissions.PRODUCTION_ROUTINGS_CREATE);
  readonly canUpdate = this.permissions.has(AppPermissions.PRODUCTION_ROUTINGS_UPDATE);
  readonly canActivate = this.permissions.has(AppPermissions.PRODUCTION_ROUTINGS_ACTIVATE);
  readonly canDeactivate = this.permissions.has(AppPermissions.PRODUCTION_ROUTINGS_DEACTIVATE);

  readonly statuses: readonly RoutingStatus[] = ROUTING_STATUSES;

  items: Routing[] = [];
  loading = false;
  error: string | null = null;

  filter = '';
  filterStatus = '';

  actionBusyId: string | null = null;

  ngOnInit(): void {
    this.load();
  }

  get filtered(): Routing[] {
    const q = this.filter.trim().toLowerCase();
    return this.items.filter((r) => {
      if (this.filterStatus && r.status !== this.filterStatus) {
        return false;
      }
      if (!q) return true;
      return (
        r.productSku.toLowerCase().includes(q) ||
        r.productName.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q)
      );
    });
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.routings.list().subscribe({
      next: (res) => {
        this.items = res.items ?? [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load routings');
        this.cdr.detectChanges();
      },
    });
  }

  statusBadgeClass(status: string): string {
    switch (status) {
      case 'DRAFT':
        return 'bg-secondary';
      case 'ACTIVE':
        return 'bg-success';
      case 'INACTIVE':
        return 'bg-dark';
      default:
        return 'bg-secondary';
    }
  }

  canActivateRouting(routing: Routing): boolean {
    return this.canActivate && routing.status !== 'ACTIVE';
  }

  canDeactivateRouting(routing: Routing): boolean {
    return this.canDeactivate && routing.status === 'ACTIVE';
  }

  runAction(routing: Routing, type: RoutingActionType): void {
    if (this.actionBusyId) {
      return;
    }
    this.actionBusyId = routing.id;
    this.cdr.detectChanges();

    const request$ =
      type === 'activate'
        ? this.routings.activate(routing.id)
        : type === 'deactivate'
          ? this.routings.deactivate(routing.id)
          : this.routings.newVersion(routing.id);

    const successMessage: Record<RoutingActionType, string> = {
      activate: 'Routing activated',
      deactivate: 'Routing deactivated',
      'new-version': 'New routing version created',
    };

    request$.subscribe({
      next: () => {
        this.actionBusyId = null;
        this.toast.success(successMessage[type]);
        this.load();
      },
      error: (err) => {
        this.actionBusyId = null;
        this.toast.error(apiErrorMessage(err, 'Action failed'));
        this.cdr.detectChanges();
      },
    });
  }
}
