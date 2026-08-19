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
import { Unit } from '../models/inventory.models';
import { UnitService } from './unit.service';

@Component({
  selector: 'app-unit-list',
  templateUrl: './unit-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class UnitListComponent implements OnInit {
  @ViewChild('formModal') formModal!: TemplateRef<unknown>;

  private readonly units = inject(UnitService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canCreate = this.permissions.has(AppPermissions.UNITS_CREATE);
  readonly canUpdate = this.permissions.has(AppPermissions.UNITS_UPDATE);

  items: Unit[] = [];
  loading = false;
  error: string | null = null;
  filter = '';
  saving = false;
  editing: Unit | null = null;
  private modalRef?: NgbModalRef;

  form = this.fb.group({
    code: ['', [Validators.required, Validators.maxLength(32)]],
    name: ['', [Validators.required, Validators.maxLength(80)]],
    isActive: [true],
  });

  ngOnInit(): void {
    this.load();
  }

  get filtered(): Unit[] {
    const q = this.filter.trim().toLowerCase();
    if (!q) {
      return this.items;
    }
    return this.items.filter(
      (u) =>
        u.code.toLowerCase().includes(q) || u.name.toLowerCase().includes(q),
    );
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.units.list().subscribe({
      next: (res) => {
        this.items = res.items ?? [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load units');
        this.cdr.detectChanges();
      },
    });
  }

  openCreate(): void {
    if (!this.canCreate) {
      return;
    }
    this.editing = null;
    this.form.reset({ code: '', name: '', isActive: true });
    this.modalRef = this.modal.open(this.formModal, { centered: true });
  }

  openEdit(item: Unit): void {
    if (!this.canUpdate) {
      return;
    }
    this.editing = item;
    this.form.reset({
      code: item.code,
      name: item.name,
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
    this.saving = true;
    this.cdr.detectChanges();

    const request$ = this.editing
      ? this.units.update(this.editing.id, {
          code: value.code!.trim(),
          name: value.name!.trim(),
          isActive: !!value.isActive,
        })
      : this.units.create({
          code: value.code!.trim(),
          name: value.name!.trim(),
        });

    request$.subscribe({
      next: () => {
        this.saving = false;
        this.modalRef?.close();
        this.toast.success(this.editing ? 'Unit updated' : 'Unit created');
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
