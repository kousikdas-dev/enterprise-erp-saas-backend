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
import { Account, AccountParent, AccountType } from '../models/accounting.models';
import { AccountService } from './account.service';

const ACCOUNT_TYPES: AccountType[] = [
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'REVENUE',
  'EXPENSE',
];

@Component({
  selector: 'app-account-list',
  templateUrl: './account-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class AccountListComponent implements OnInit {
  @ViewChild('formModal') formModal!: TemplateRef<unknown>;

  private readonly accounts = inject(AccountService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canCreate = this.permissions.has(AppPermissions.ACCOUNTS_CREATE);
  readonly canUpdate = this.permissions.has(AppPermissions.ACCOUNTS_UPDATE);
  readonly accountTypes = ACCOUNT_TYPES;

  items: Account[] = [];
  loading = false;
  error: string | null = null;
  filter = '';
  saving = false;
  statusBusyId: string | null = null;
  editing: Account | null = null;
  private modalRef?: NgbModalRef;

  form = this.fb.group({
    code: ['', [Validators.required, Validators.maxLength(32)]],
    name: ['', [Validators.required, Validators.maxLength(160)]],
    type: ['ASSET' as AccountType, [Validators.required]],
    parentId: [''],
    description: ['', [Validators.maxLength(500)]],
  });

  ngOnInit(): void {
    this.load();
  }

  get filtered(): Account[] {
    const q = this.filter.trim().toLowerCase();
    if (!q) {
      return this.items;
    }
    return this.items.filter(
      (a) =>
        a.code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.type.toLowerCase().includes(q),
    );
  }

  /** Flat Parent Account options, excluding the account being edited (it cannot be its own parent). */
  get parentOptions(): Account[] {
    return this.items.filter((a) => a.id !== this.editing?.id);
  }

  parentLabel(account: Account | AccountParent): string {
    return `${account.code} - ${account.name}`;
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.accounts.list().subscribe({
      next: (res) => {
        this.items = res.items ?? [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load accounts');
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
      code: '',
      name: '',
      type: 'ASSET',
      parentId: '',
      description: '',
    });
    this.modalRef = this.modal.open(this.formModal, { centered: true });
  }

  openEdit(item: Account): void {
    if (!this.canUpdate) {
      return;
    }
    this.editing = item;
    this.form.reset({
      code: item.code,
      name: item.name,
      type: item.type,
      parentId: item.parentId ?? '',
      description: item.description ?? '',
    });
    this.modalRef = this.modal.open(this.formModal, { centered: true });
  }

  save(): void {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const parentId = value.parentId || undefined;
    const description = value.description?.trim() || undefined;
    this.saving = true;
    this.cdr.detectChanges();

    const request$ = this.editing
      ? this.accounts.update(this.editing.id, {
          code: value.code!.trim(),
          name: value.name!.trim(),
          type: value.type!,
          parentId: parentId ?? null,
          description: description ?? null,
        })
      : this.accounts.create({
          code: value.code!.trim(),
          name: value.name!.trim(),
          type: value.type!,
          parentId,
          description,
        });

    request$.subscribe({
      next: () => {
        this.saving = false;
        this.modalRef?.close();
        this.toast.success(this.editing ? 'Account updated' : 'Account created');
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

  toggleStatus(item: Account): void {
    if (!this.canUpdate || this.statusBusyId) {
      return;
    }
    const nextActive = !item.isActive;
    this.statusBusyId = item.id;
    this.cdr.detectChanges();
    this.accounts.updateStatus(item.id, { isActive: nextActive }).subscribe({
      next: (updated) => {
        this.statusBusyId = null;
        this.toast.success(updated.isActive ? 'Account activated' : 'Account deactivated');
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
}
