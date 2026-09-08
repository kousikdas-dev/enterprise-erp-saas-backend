import {
  Component,
  OnInit,
  TemplateRef,
  ViewChild,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { AppPermissions } from '../../../core/permissions/permissions.constants';
import { PermissionService } from '../../../core/permissions/permission.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import {
  Account,
  TaxCode,
  TaxComponentType,
} from '../models/accounting.models';
import { AccountService } from '../accounts/account.service';
import { TaxCodeService } from './tax-code.service';

const TAX_COMPONENT_TYPES: TaxComponentType[] = ['CGST', 'SGST', 'IGST', 'CESS', 'OTHER'];
const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

@Component({
  selector: 'app-tax-code-list',
  templateUrl: './tax-code-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class TaxCodeListComponent implements OnInit {
  @ViewChild('formModal') formModal!: TemplateRef<unknown>;

  private readonly taxCodes = inject(TaxCodeService);
  private readonly accountService = inject(AccountService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canCreate = this.permissions.has(AppPermissions.TAX_CODES_CREATE);
  readonly canUpdate = this.permissions.has(AppPermissions.TAX_CODES_UPDATE);
  readonly componentTypes = TAX_COMPONENT_TYPES;

  items: TaxCode[] = [];
  private allAccounts: Account[] = [];
  accounts: Account[] = [];
  loading = false;
  error: string | null = null;
  filter = '';
  saving = false;
  statusBusyId: string | null = null;
  editing: TaxCode | null = null;
  private modalRef?: NgbModalRef;

  form = this.fb.group({
    code: ['', [Validators.required, Validators.maxLength(32)]],
    name: ['', [Validators.required, Validators.maxLength(160)]],
    description: ['', Validators.maxLength(500)],
    components: this.fb.array([this.createComponentGroup(1)]),
  });

  ngOnInit(): void {
    this.loadAccounts();
    this.load();
  }

  get components(): FormArray {
    return this.form.get('components') as FormArray;
  }

  get filtered(): TaxCode[] {
    const q = this.filter.trim().toLowerCase();
    if (!q) {
      return this.items;
    }
    return this.items.filter(
      (t) =>
        t.code.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        (t.description ?? '').toLowerCase().includes(q),
    );
  }

  createComponentGroup(
    sequence: number,
    type: TaxComponentType = 'CGST',
    name = '',
    rate = '',
    accountId = '',
  ): FormGroup {
    return this.fb.group({
      sequence: [sequence],
      type: [type, Validators.required],
      name: [name, Validators.maxLength(160)],
      rate: [rate, [Validators.required, Validators.pattern(DECIMAL_PATTERN)]],
      accountId: [accountId],
    });
  }

  accountLabel(id: string | null): string {
    if (!id) {
      return '—';
    }
    const account = this.allAccounts.find((a) => a.id === id);
    if (!account) {
      return id.slice(0, 8);
    }
    return account.isActive
      ? `${account.code} - ${account.name}`
      : `${account.code} - ${account.name} (INACTIVE)`;
  }

  /** Active accounts, plus any inactive accounts already used by this tax code's components (so their value stays visible). */
  private accountOptionsFor(item: TaxCode): Account[] {
    const active = this.allAccounts.filter((a) => a.isActive);
    const inactiveUsed = new Map<string, Account>();
    for (const component of item.components ?? []) {
      if (!component.accountId) {
        continue;
      }
      const account = this.allAccounts.find((a) => a.id === component.accountId);
      if (account && !account.isActive) {
        inactiveUsed.set(account.id, account);
      }
    }
    return [...active, ...inactiveUsed.values()];
  }

  loadAccounts(): void {
    this.accountService.list().subscribe({
      next: (res) => {
        this.allAccounts = res.items ?? [];
        this.accounts = this.allAccounts.filter((a) => a.isActive);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load accounts'));
        this.cdr.detectChanges();
      },
    });
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.taxCodes.list().subscribe({
      next: (res) => {
        this.items = res.items ?? [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load tax codes');
        this.cdr.detectChanges();
      },
    });
  }

  addComponent(): void {
    this.components.push(this.createComponentGroup(this.components.length + 1));
  }

  removeComponent(index: number): void {
    if (this.components.length <= 1) {
      return;
    }
    this.components.removeAt(index);
    this.components.controls.forEach((control, i) => {
      control.get('sequence')?.setValue(i + 1);
    });
  }

  openCreate(): void {
    if (!this.canCreate) {
      return;
    }
    this.editing = null;
    this.accounts = this.allAccounts.filter((a) => a.isActive);
    this.form.reset({
      code: '',
      name: '',
      description: '',
    });
    this.components.clear();
    this.components.push(this.createComponentGroup(1));
    this.cdr.detectChanges();
    this.modalRef = this.modal.open(this.formModal, { centered: true, size: 'xl' });
  }

  openEdit(item: TaxCode): void {
    if (!this.canUpdate) {
      return;
    }
    this.editing = item;
    this.accounts = this.accountOptionsFor(item);
    this.form.reset({
      code: item.code,
      name: item.name,
      description: item.description ?? '',
    });
    this.components.clear();
    for (const component of item.components ?? []) {
      this.components.push(
        this.createComponentGroup(
          component.sequence,
          component.type,
          component.name ?? '',
          component.rate,
          component.accountId ?? '',
        ),
      );
    }
    if (this.components.length === 0) {
      this.components.push(this.createComponentGroup(1));
    }
    this.cdr.detectChanges();
    this.modalRef = this.modal.open(this.formModal, { centered: true, size: 'xl' });
  }

  save(): void {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const description = value.description?.trim() || undefined;
    const rawComponents = this.components.getRawValue() as Array<{
      sequence: number;
      type: TaxComponentType;
      name: string;
      rate: string;
      accountId: string;
    }>;
    const components = rawComponents.map((component) => ({
      sequence: component.sequence,
      type: component.type,
      name: component.name?.trim() || undefined,
      rate: String(component.rate).trim(),
      accountId: component.accountId?.trim() || undefined,
    }));

    this.saving = true;
    this.cdr.detectChanges();

    const request$ = this.editing
      ? this.taxCodes.update(this.editing.id, {
          code: value.code!.trim(),
          name: value.name!.trim(),
          description: description ?? null,
          components,
        })
      : this.taxCodes.create({
          code: value.code!.trim(),
          name: value.name!.trim(),
          description,
          components,
        });

    request$.subscribe({
      next: () => {
        this.saving = false;
        this.modalRef?.close();
        this.toast.success(this.editing ? 'Tax code updated' : 'Tax code created');
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

  toggleStatus(item: TaxCode): void {
    if (!this.canUpdate || this.statusBusyId) {
      return;
    }
    const nextActive = !item.isActive;
    this.statusBusyId = item.id;
    this.cdr.detectChanges();
    this.taxCodes.updateStatus(item.id, { isActive: nextActive }).subscribe({
      next: (updated) => {
        this.statusBusyId = null;
        this.toast.success(updated.isActive ? 'Tax code activated' : 'Tax code deactivated');
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
