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
import { Role, User, UserRole, UserStatus } from '../models/administration.models';
import { RoleService } from '../roles/role.service';
import { UserService } from './user.service';

@Component({
  selector: 'app-user-list',
  templateUrl: './user-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class UserListComponent implements OnInit {
  @ViewChild('formModal') formModal!: TemplateRef<unknown>;
  @ViewChild('detailModal') detailModal!: TemplateRef<unknown>;

  private readonly users = inject(UserService);
  private readonly roleService = inject(RoleService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canCreate = this.permissions.has(AppPermissions.USERS_CREATE);
  readonly canUpdate = this.permissions.has(AppPermissions.USERS_UPDATE);
  readonly canChangeStatus = this.permissions.has(AppPermissions.USERS_STATUS);
  readonly canManageRoles = this.permissions.has(AppPermissions.USERS_ROLES);

  items: User[] = [];
  roles: Role[] = [];
  loading = false;
  error: string | null = null;
  filter = '';
  saving = false;
  statusBusyId: string | null = null;
  editing: User | null = null;
  viewing: User | null = null;

  /**
   * The backend exposes only POST (assign) and DELETE (remove) for user
   * roles — there is no endpoint to read a user's existing assignments.
   * This tracks assignments made/removed in this browser session only.
   */
  sessionRoles = new Map<string, UserRole[]>();
  assignRoleId = '';
  roleActionBusy = false;

  private modalRef?: NgbModalRef;

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
    firstName: ['', [Validators.required, Validators.maxLength(80)]],
    lastName: ['', [Validators.required, Validators.maxLength(80)]],
    status: ['ACTIVE' as UserStatus],
  });

  ngOnInit(): void {
    this.load();
    this.loadRoles();
  }

  get filtered(): User[] {
    const q = this.filter.trim().toLowerCase();
    if (!q) {
      return this.items;
    }
    return this.items.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.firstName.toLowerCase().includes(q) ||
        u.lastName.toLowerCase().includes(q) ||
        u.status.toLowerCase().includes(q),
    );
  }

  get viewingRoles(): UserRole[] {
    return this.viewing ? this.sessionRoles.get(this.viewing.id) ?? [] : [];
  }

  get assignableRoles(): Role[] {
    const assignedIds = new Set(this.viewingRoles.map((r) => r.roleId));
    return this.roles.filter((r) => !assignedIds.has(r.id));
  }

  fullName(user: User): string {
    return `${user.firstName} ${user.lastName}`.trim();
  }

  statusBadgeClass(status: UserStatus): string {
    switch (status) {
      case 'ACTIVE':
        return 'bg-success';
      case 'INACTIVE':
        return 'bg-secondary';
      case 'INVITED':
        return 'bg-info text-dark';
      case 'LOCKED':
        return 'bg-danger';
      default:
        return 'bg-secondary';
    }
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.users.list().subscribe({
      next: (res) => {
        this.items = res.items ?? [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load users');
        this.cdr.detectChanges();
      },
    });
  }

  loadRoles(): void {
    this.roleService.list().subscribe({
      next: (res) => {
        this.roles = res.items ?? [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load roles'));
        this.cdr.detectChanges();
      },
    });
  }

  openCreate(): void {
    if (!this.canCreate) {
      return;
    }
    this.editing = null;
    this.form.reset({
      email: '',
      password: '',
      firstName: '',
      lastName: '',
      status: 'ACTIVE',
    });
    this.form.controls.password.enable();
    this.modalRef = this.modal.open(this.formModal, { centered: true });
  }

  openEdit(item: User): void {
    if (!this.canUpdate) {
      return;
    }
    this.editing = item;
    this.form.reset({
      email: item.email,
      password: '',
      firstName: item.firstName,
      lastName: item.lastName,
      status: item.status,
    });
    this.form.controls.password.disable();
    this.modalRef = this.modal.open(this.formModal, { centered: true });
  }

  openDetail(item: User): void {
    this.viewing = item;
    this.assignRoleId = '';
    this.modal.open(this.detailModal, { centered: true, size: 'lg' });
    this.users.getById(item.id).subscribe({
      next: (detail) => {
        this.viewing = detail;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load user details'));
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
    this.saving = true;
    this.cdr.detectChanges();

    const request$ = this.editing
      ? this.users.update(this.editing.id, {
          email: value.email!.trim().toLowerCase(),
          firstName: value.firstName!.trim(),
          lastName: value.lastName!.trim(),
        })
      : this.users.create({
          email: value.email!.trim().toLowerCase(),
          password: value.password!,
          firstName: value.firstName!.trim(),
          lastName: value.lastName!.trim(),
          status: value.status ?? undefined,
        });

    request$.subscribe({
      next: () => {
        this.saving = false;
        this.modalRef?.close();
        this.toast.success(this.editing ? 'User updated' : 'User created');
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

  toggleStatus(user: User): void {
    if (!this.canChangeStatus || this.statusBusyId) {
      return;
    }
    const nextStatus: UserStatus = user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    this.statusBusyId = user.id;
    this.cdr.detectChanges();
    this.users.updateStatus(user.id, { status: nextStatus }).subscribe({
      next: (updated) => {
        this.statusBusyId = null;
        this.toast.success(
          updated.status === 'ACTIVE' ? 'User activated' : 'User deactivated',
        );
        if (this.viewing?.id === updated.id) {
          this.viewing = updated;
        }
        this.load();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.statusBusyId = null;
        this.toast.error(apiErrorMessage(err, 'Status change failed'));
        this.cdr.detectChanges();
      },
    });
  }

  assignRole(): void {
    if (!this.canManageRoles || !this.viewing || !this.assignRoleId || this.roleActionBusy) {
      return;
    }
    const userId = this.viewing.id;
    this.roleActionBusy = true;
    this.cdr.detectChanges();
    this.users.assignRole(userId, this.assignRoleId).subscribe({
      next: (assignment) => {
        this.roleActionBusy = false;
        const current = this.sessionRoles.get(userId) ?? [];
        this.sessionRoles.set(userId, [...current, assignment]);
        this.assignRoleId = '';
        this.toast.success(`Role "${assignment.roleName}" assigned`);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.roleActionBusy = false;
        this.toast.error(apiErrorMessage(err, 'Assign role failed'));
        this.cdr.detectChanges();
      },
    });
  }

  removeRole(role: UserRole): void {
    if (!this.canManageRoles || !this.viewing || this.roleActionBusy) {
      return;
    }
    const userId = this.viewing.id;
    this.roleActionBusy = true;
    this.cdr.detectChanges();
    this.users.removeRole(userId, role.roleId).subscribe({
      next: () => {
        this.roleActionBusy = false;
        const current = this.sessionRoles.get(userId) ?? [];
        this.sessionRoles.set(
          userId,
          current.filter((r) => r.roleId !== role.roleId),
        );
        this.toast.success(`Role "${role.roleName}" removed`);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.roleActionBusy = false;
        this.toast.error(apiErrorMessage(err, 'Remove role failed'));
        this.cdr.detectChanges();
      },
    });
  }
}
