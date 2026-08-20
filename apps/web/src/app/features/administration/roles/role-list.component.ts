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
import { AppPermissions } from '../../../core/permissions/permissions.constants';
import { PermissionService } from '../../../core/permissions/permission.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { Permission, Role } from '../models/administration.models';
import { PermissionCatalogService } from '../permissions/permission.service';
import { RoleService } from './role.service';

@Component({
  selector: 'app-role-list',
  templateUrl: './role-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class RoleListComponent implements OnInit {
  @ViewChild('formModal') formModal!: TemplateRef<unknown>;
  @ViewChild('detailModal') detailModal!: TemplateRef<unknown>;

  private readonly roles = inject(RoleService);
  private readonly catalog = inject(PermissionCatalogService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canCreate = this.permissions.has(AppPermissions.ROLES_CREATE);
  readonly canUpdate = this.permissions.has(AppPermissions.ROLES_UPDATE);
  readonly canManagePermissions = this.permissions.has(AppPermissions.ROLES_PERMISSIONS);

  items: Role[] = [];
  catalogPermissions: Permission[] = [];
  loading = false;
  error: string | null = null;
  filter = '';
  saving = false;
  editing: Role | null = null;
  viewing: Role | null = null;
  assignPermissionId = '';
  permissionActionBusy = false;
  private modalRef?: NgbModalRef;

  form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    description: ['', [Validators.maxLength(255)]],
  });

  ngOnInit(): void {
    this.load();
    this.loadCatalog();
  }

  get filtered(): Role[] {
    const q = this.filter.trim().toLowerCase();
    if (!q) {
      return this.items;
    }
    return this.items.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q),
    );
  }

  get assignablePermissions(): Permission[] {
    const assignedIds = new Set((this.viewing?.permissions ?? []).map((p) => p.id));
    return this.catalogPermissions.filter((p) => !assignedIds.has(p.id));
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.roles.list().subscribe({
      next: (res) => {
        this.items = res.items ?? [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load roles');
        this.cdr.detectChanges();
      },
    });
  }

  loadCatalog(): void {
    this.catalog.list().subscribe({
      next: (res) => {
        this.catalogPermissions = res.items ?? [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load permission catalog'));
        this.cdr.detectChanges();
      },
    });
  }

  openCreate(): void {
    if (!this.canCreate) {
      return;
    }
    this.editing = null;
    this.form.reset({ name: '', description: '' });
    this.modalRef = this.modal.open(this.formModal, { centered: true });
  }

  openEdit(item: Role): void {
    if (!this.canUpdate) {
      return;
    }
    this.editing = item;
    this.form.reset({ name: item.name, description: item.description ?? '' });
    this.modalRef = this.modal.open(this.formModal, { centered: true });
  }

  openDetail(item: Role): void {
    this.viewing = item;
    this.assignPermissionId = '';
    this.modal.open(this.detailModal, { centered: true, size: 'lg' });
    this.roles.getById(item.id).subscribe({
      next: (detail) => {
        this.viewing = detail;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load role details'));
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
      ? this.roles.update(this.editing.id, {
          name: value.name!.trim(),
          description,
        })
      : this.roles.create({
          name: value.name!.trim(),
          description,
        });

    request$.subscribe({
      next: () => {
        this.saving = false;
        this.modalRef?.close();
        this.toast.success(this.editing ? 'Role updated' : 'Role created');
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

  assignPermission(): void {
    if (
      !this.canManagePermissions ||
      !this.viewing ||
      !this.assignPermissionId ||
      this.permissionActionBusy
    ) {
      return;
    }
    const roleId = this.viewing.id;
    this.permissionActionBusy = true;
    this.cdr.detectChanges();
    this.roles.assignPermission(roleId, this.assignPermissionId).subscribe({
      next: (updated) => {
        this.permissionActionBusy = false;
        this.viewing = updated;
        this.assignPermissionId = '';
        this.toast.success('Permission assigned');
        this.load();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.permissionActionBusy = false;
        this.toast.error(apiErrorMessage(err, 'Assign permission failed'));
        this.cdr.detectChanges();
      },
    });
  }

  removePermission(permission: Permission): void {
    if (!this.canManagePermissions || !this.viewing || this.permissionActionBusy) {
      return;
    }
    const roleId = this.viewing.id;
    this.permissionActionBusy = true;
    this.cdr.detectChanges();
    this.roles.removePermission(roleId, permission.id).subscribe({
      next: (updated) => {
        this.permissionActionBusy = false;
        this.viewing = updated;
        this.toast.success('Permission removed');
        this.load();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.permissionActionBusy = false;
        this.toast.error(apiErrorMessage(err, 'Remove permission failed'));
        this.cdr.detectChanges();
      },
    });
  }
}
