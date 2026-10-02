import {
  Component,
  OnInit,
  TemplateRef,
  ViewChild,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { Observable } from 'rxjs';
import { AppPermissions } from '../../../core/permissions/permissions.constants';
import { PermissionService } from '../../../core/permissions/permission.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { WorkCentre } from '../models/production.models';
import { WorkCentreService } from './work-centre.service';

type PendingActionType = 'activate' | 'deactivate' | 'delete';

@Component({
  selector: 'app-work-centre-list',
  templateUrl: './work-centre-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class WorkCentreListComponent implements OnInit {
  @ViewChild('formModal') formModal!: TemplateRef<unknown>;
  @ViewChild('confirmModal') confirmModal!: TemplateRef<unknown>;

  private readonly workCentres = inject(WorkCentreService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canCreate = this.permissions.has(AppPermissions.PRODUCTION_WORK_CENTRES_CREATE);
  readonly canUpdate = this.permissions.has(AppPermissions.PRODUCTION_WORK_CENTRES_UPDATE);
  readonly canDelete = this.permissions.has(AppPermissions.PRODUCTION_WORK_CENTRES_DELETE);
  readonly canActivate = this.permissions.has(
    AppPermissions.PRODUCTION_WORK_CENTRES_ACTIVATE,
  );
  readonly canDeactivate = this.permissions.has(
    AppPermissions.PRODUCTION_WORK_CENTRES_DEACTIVATE,
  );

  items: WorkCentre[] = [];
  loading = false;
  error: string | null = null;

  search = '';
  filterStatus = '';

  saving = false;
  actionBusy = false;
  editing: WorkCentre | null = null;
  pendingAction: { type: PendingActionType; workCentre: WorkCentre } | null = null;
  private modalRef?: NgbModalRef;

  form = this.fb.group({
    code: ['', [Validators.required, Validators.maxLength(32)]],
    name: ['', [Validators.required, Validators.maxLength(120)]],
    description: ['', Validators.maxLength(500)],
  });

  ngOnInit(): void {
    this.load();
  }

  get filtered(): WorkCentre[] {
    const q = this.search.trim().toLowerCase();
    return this.items.filter((w) => {
      if (this.filterStatus === 'active' && !w.isActive) {
        return false;
      }
      if (this.filterStatus === 'inactive' && w.isActive) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        w.code.toLowerCase().includes(q) || w.name.toLowerCase().includes(q)
      );
    });
  }

  clearFilters(): void {
    this.search = '';
    this.filterStatus = '';
    this.cdr.detectChanges();
  }

  canEdit(_workCentre: WorkCentre): boolean {
    return this.canUpdate;
  }

  canActivateWorkCentre(workCentre: WorkCentre): boolean {
    return this.canActivate && !workCentre.isActive;
  }

  canDeactivateWorkCentre(workCentre: WorkCentre): boolean {
    return this.canDeactivate && workCentre.isActive;
  }

  canRemove(_workCentre: WorkCentre): boolean {
    return this.canDelete;
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.workCentres.list().subscribe({
      next: (res) => {
        this.items = res.items ?? [];
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

  openCreate(): void {
    if (!this.canCreate) {
      return;
    }
    this.editing = null;
    this.form.reset({ code: '', name: '', description: '' });
    this.modalRef = this.modal.open(this.formModal, { centered: true });
  }

  openEdit(item: WorkCentre): void {
    if (!this.canEdit(item)) {
      return;
    }
    this.editing = item;
    this.form.reset({
      code: item.code,
      name: item.name,
      description: item.description ?? '',
    });
    this.modalRef = this.modal.open(this.formModal, { centered: true });
  }

  askActivate(workCentre: WorkCentre): void {
    this.pendingAction = { type: 'activate', workCentre };
    this.modal.open(this.confirmModal, { centered: true });
  }

  askDeactivate(workCentre: WorkCentre): void {
    this.pendingAction = { type: 'deactivate', workCentre };
    this.modal.open(this.confirmModal, { centered: true });
  }

  askDelete(workCentre: WorkCentre): void {
    this.pendingAction = { type: 'delete', workCentre };
    this.modal.open(this.confirmModal, { centered: true });
  }

  confirmActionLabel(type: PendingActionType | undefined): string {
    switch (type) {
      case 'activate':
        return 'Activate';
      case 'deactivate':
        return 'Deactivate';
      case 'delete':
        return 'Delete';
      default:
        return 'Confirm';
    }
  }

  runPendingAction(modal: { close: () => void }): void {
    if (!this.pendingAction || this.actionBusy) {
      return;
    }
    const { type, workCentre } = this.pendingAction;
    this.actionBusy = true;
    this.cdr.detectChanges();

    const request$: Observable<unknown> =
      type === 'activate'
        ? this.workCentres.activate(workCentre.id)
        : type === 'deactivate'
          ? this.workCentres.deactivate(workCentre.id)
          : this.workCentres.remove(workCentre.id);

    const successMessage: Record<PendingActionType, string> = {
      activate: 'Work centre activated',
      deactivate: 'Work centre deactivated',
      delete: 'Work centre deleted',
    };

    request$.subscribe({
      next: () => {
        this.actionBusy = false;
        modal.close();
        this.pendingAction = null;
        this.toast.success(successMessage[type]);
        this.load();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.actionBusy = false;
        this.toast.error(apiErrorMessage(err, 'Action failed'));
        this.cdr.detectChanges();
      },
    });
  }

  save(): void {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const description = value.description?.trim() || undefined;
    this.saving = true;
    this.cdr.detectChanges();

    const request$ = this.editing
      ? this.workCentres.update(this.editing.id, {
          code: value.code!.trim(),
          name: value.name!.trim(),
          description,
        })
      : this.workCentres.create({
          code: value.code!.trim(),
          name: value.name!.trim(),
          description,
        });

    request$.subscribe({
      next: () => {
        this.saving = false;
        this.modalRef?.close();
        this.toast.success(this.editing ? 'Work centre updated' : 'Work centre created');
        this.load();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.saving = false;
        this.toast.error(apiErrorMessage(err, 'Save failed'));
        this.cdr.detectChanges();
      },
    });
  }
}
