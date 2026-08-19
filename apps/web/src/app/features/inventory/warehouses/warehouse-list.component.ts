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
import { Warehouse } from '../models/inventory.models';
import { WarehouseService } from './warehouse.service';

@Component({
  selector: 'app-warehouse-list',
  templateUrl: './warehouse-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class WarehouseListComponent implements OnInit {
  @ViewChild('formModal') formModal!: TemplateRef<unknown>;

  private readonly warehouses = inject(WarehouseService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canCreate = this.permissions.has(AppPermissions.WAREHOUSES_CREATE);
  readonly canUpdate = this.permissions.has(AppPermissions.WAREHOUSES_UPDATE);

  items: Warehouse[] = [];
  loading = false;
  error: string | null = null;
  filter = '';
  saving = false;
  editing: Warehouse | null = null;
  private modalRef?: NgbModalRef;

  form = this.fb.group({
    code: ['', [Validators.required, Validators.maxLength(32)]],
    name: ['', [Validators.required, Validators.maxLength(120)]],
    address: ['', [Validators.maxLength(255)]],
    isActive: [true],
  });

  ngOnInit(): void {
    this.load();
  }

  get filtered(): Warehouse[] {
    const q = this.filter.trim().toLowerCase();
    if (!q) {
      return this.items;
    }
    return this.items.filter(
      (w) =>
        w.code.toLowerCase().includes(q) ||
        w.name.toLowerCase().includes(q) ||
        (w.address ?? '').toLowerCase().includes(q),
    );
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.warehouses.list().subscribe({
      next: (res) => {
        this.items = res.items ?? [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load warehouses');
        this.cdr.detectChanges();
      },
    });
  }

  openCreate(): void {
    if (!this.canCreate) {
      return;
    }
    this.editing = null;
    this.form.reset({ code: '', name: '', address: '', isActive: true });
    this.modalRef = this.modal.open(this.formModal, { centered: true });
  }

  openEdit(item: Warehouse): void {
    if (!this.canUpdate) {
      return;
    }
    this.editing = item;
    this.form.reset({
      code: item.code,
      name: item.name,
      address: item.address ?? '',
      isActive: item.isActive,
    });
    this.modalRef = this.modal.open(this.formModal, { centered: true });
  }

  save(): void {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const address = value.address?.trim() || undefined;
    this.saving = true;
    this.cdr.detectChanges();

    const request$ = this.editing
      ? this.warehouses.update(this.editing.id, {
          code: value.code!.trim(),
          name: value.name!.trim(),
          address,
          isActive: !!value.isActive,
        })
      : this.warehouses.create({
          code: value.code!.trim(),
          name: value.name!.trim(),
          address,
        });

    request$.subscribe({
      next: () => {
        this.saving = false;
        this.modalRef?.close();
        this.toast.success(
          this.editing ? 'Warehouse updated' : 'Warehouse created',
        );
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
