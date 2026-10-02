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
import { Operation } from '../models/production.models';
import { OperationService } from './operation.service';

type PendingActionType = 'activate' | 'deactivate' | 'delete';

@Component({
  selector: 'app-operation-list',
  templateUrl: './operation-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class OperationListComponent implements OnInit {
  @ViewChild('formModal') formModal!: TemplateRef<unknown>;
  @ViewChild('confirmModal') confirmModal!: TemplateRef<unknown>;

  private readonly operations = inject(OperationService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canCreate = this.permissions.has(AppPermissions.PRODUCTION_OPERATIONS_CREATE);
  readonly canUpdate = this.permissions.has(AppPermissions.PRODUCTION_OPERATIONS_UPDATE);
  readonly canDelete = this.permissions.has(AppPermissions.PRODUCTION_OPERATIONS_DELETE);
  readonly canActivate = this.permissions.has(
    AppPermissions.PRODUCTION_OPERATIONS_ACTIVATE,
  );
  readonly canDeactivate = this.permissions.has(
    AppPermissions.PRODUCTION_OPERATIONS_DEACTIVATE,
  );

  items: Operation[] = [];
  loading = false;
  error: string | null = null;

  search = '';
  filterStatus = '';

  saving = false;
  actionBusy = false;
  editing: Operation | null = null;
  pendingAction: { type: PendingActionType; operation: Operation } | null = null;
  private modalRef?: NgbModalRef;

  form = this.fb.group({
    code: ['', [Validators.required, Validators.maxLength(32)]],
    name: ['', [Validators.required, Validators.maxLength(120)]],
    description: ['', Validators.maxLength(500)],
  });

  ngOnInit(): void {
    this.load();
  }

  get filtered(): Operation[] {
    const q = this.search.trim().toLowerCase();
    return this.items.filter((o) => {
      if (this.filterStatus === 'active' && !o.isActive) {
        return false;
      }
      if (this.filterStatus === 'inactive' && o.isActive) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        o.code.toLowerCase().includes(q) || o.name.toLowerCase().includes(q)
      );
    });
  }

  clearFilters(): void {
    this.search = '';
    this.filterStatus = '';
    this.cdr.detectChanges();
  }

  canEdit(_operation: Operation): boolean {
    return this.canUpdate;
  }

  canActivateOperation(operation: Operation): boolean {
    return this.canActivate && !operation.isActive;
  }

  canDeactivateOperation(operation: Operation): boolean {
    return this.canDeactivate && operation.isActive;
  }

  canRemove(_operation: Operation): boolean {
    return this.canDelete;
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.operations.list().subscribe({
      next: (res) => {
        this.items = res.items ?? [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load operations');
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

  openEdit(item: Operation): void {
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

  askActivate(operation: Operation): void {
    this.pendingAction = { type: 'activate', operation };
    this.modal.open(this.confirmModal, { centered: true });
  }

  askDeactivate(operation: Operation): void {
    this.pendingAction = { type: 'deactivate', operation };
    this.modal.open(this.confirmModal, { centered: true });
  }

  askDelete(operation: Operation): void {
    this.pendingAction = { type: 'delete', operation };
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
    const { type, operation } = this.pendingAction;
    this.actionBusy = true;
    this.cdr.detectChanges();

    const request$: Observable<unknown> =
      type === 'activate'
        ? this.operations.activate(operation.id)
        : type === 'deactivate'
          ? this.operations.deactivate(operation.id)
          : this.operations.remove(operation.id);

    const successMessage: Record<PendingActionType, string> = {
      activate: 'Operation activated',
      deactivate: 'Operation deactivated',
      delete: 'Operation deleted',
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
      ? this.operations.update(this.editing.id, {
          code: value.code!.trim(),
          name: value.name!.trim(),
          description,
        })
      : this.operations.create({
          code: value.code!.trim(),
          name: value.name!.trim(),
          description,
        });

    request$.subscribe({
      next: () => {
        this.saving = false;
        this.modalRef?.close();
        this.toast.success(this.editing ? 'Operation updated' : 'Operation created');
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
