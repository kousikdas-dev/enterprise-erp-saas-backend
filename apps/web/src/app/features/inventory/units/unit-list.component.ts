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
import { Router } from '@angular/router';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { AppPermissions } from '../../../core/permissions/permissions.constants';
import { PermissionService } from '../../../core/permissions/permission.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { Unit, UnspscCategory } from '../models/inventory.models';
import { UnspscCategoryService } from '../unspsc-categories/unspsc-category.service';
import { UnitService } from './unit.service';

/** Sentinel option value for the UNSPSC Category select's "Search more…" row. */
const SEARCH_MORE = '__search_more__';

@Component({
  selector: 'app-unit-list',
  templateUrl: './unit-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class UnitListComponent implements OnInit {
  @ViewChild('formModal') formModal!: TemplateRef<unknown>;

  private readonly units = inject(UnitService);
  private readonly unspscCategories = inject(UnspscCategoryService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly router = inject(Router);

  readonly canCreate = this.permissions.has(AppPermissions.UNITS_CREATE);
  readonly canUpdate = this.permissions.has(AppPermissions.UNITS_UPDATE);

  readonly searchMoreValue = SEARCH_MORE;

  items: Unit[] = [];
  unspscCategoryOptions: UnspscCategory[] = [];
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
    referenceUnitId: [''],
    conversionFactor: [''],
    unspscCategoryId: [''],
  });

  ngOnInit(): void {
    this.load();
    this.unspscCategories.list().subscribe({
      next: (res) => (this.unspscCategoryOptions = res.items ?? []),
      error: () => {
        // Non-fatal: the UNSPSC Category field just shows no options besides "Search more…".
      },
    });
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

  /** Candidates for "Reference Unit" — every active unit except the one being edited. */
  get referenceUnitOptions(): Unit[] {
    return this.items.filter(
      (u) => u.isActive && (!this.editing || u.id !== this.editing.id),
    );
  }

  formatFactor(value: string): string {
    const n = Number(value);
    return Number.isFinite(n) ? n.toString() : value;
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
    this.form.reset({
      code: '',
      name: '',
      isActive: true,
      referenceUnitId: '',
      conversionFactor: '',
      unspscCategoryId: '',
    });
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
      referenceUnitId: item.referenceUnitId ?? '',
      conversionFactor: item.conversionFactor ?? '',
      unspscCategoryId: item.unspscCategoryId ?? '',
    });
    this.modalRef = this.modal.open(this.formModal, { centered: true });
  }

  /**
   * The UNSPSC Category select's last option is "Search more…" — picking it
   * doesn't set the field, it opens the full UNSPSC Categories master instead.
   * Every other option behaves like a normal select (no navigation).
   */
  onUnspscCategoryChange(value: string): void {
    if (value !== SEARCH_MORE) {
      return;
    }
    this.form.patchValue({ unspscCategoryId: this.editing?.unspscCategoryId ?? '' });
    this.modalRef?.dismiss();
    void this.router.navigate(['/inventory/unspsc-categories']);
  }

  save(): void {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const referenceUnitId = value.referenceUnitId?.trim() || undefined;
    const conversionFactor =
      value.conversionFactor === '' ||
      value.conversionFactor === null ||
      value.conversionFactor === undefined
        ? undefined
        : String(value.conversionFactor);
    if ((referenceUnitId === undefined) !== (conversionFactor === undefined)) {
      this.toast.error('Set both Reference Unit and Quantity, or neither.');
      return;
    }
    const unspscCategoryId = value.unspscCategoryId?.trim() || undefined;
    this.saving = true;
    this.cdr.detectChanges();

    const request$ = this.editing
      ? this.units.update(this.editing.id, {
          code: value.code!.trim(),
          name: value.name!.trim(),
          isActive: !!value.isActive,
          referenceUnitId,
          conversionFactor,
          unspscCategoryId,
        })
      : this.units.create({
          code: value.code!.trim(),
          name: value.name!.trim(),
          referenceUnitId,
          conversionFactor,
          unspscCategoryId,
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
