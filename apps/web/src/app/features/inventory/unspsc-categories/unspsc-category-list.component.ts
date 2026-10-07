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
import { UnspscCategory } from '../models/inventory.models';
import { UnspscCategoryService } from './unspsc-category.service';

@Component({
  selector: 'app-unspsc-category-list',
  templateUrl: './unspsc-category-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class UnspscCategoryListComponent implements OnInit {
  @ViewChild('formModal') formModal!: TemplateRef<unknown>;

  private readonly categories = inject(UnspscCategoryService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canCreate = this.permissions.has(
    AppPermissions.UNSPSC_CATEGORIES_CREATE,
  );
  readonly canUpdate = this.permissions.has(
    AppPermissions.UNSPSC_CATEGORIES_UPDATE,
  );

  items: UnspscCategory[] = [];
  loading = false;
  error: string | null = null;
  filter = '';
  saving = false;
  editing: UnspscCategory | null = null;
  private modalRef?: NgbModalRef;

  form = this.fb.group({
    code: ['', [Validators.required, Validators.maxLength(32)]],
    name: ['', [Validators.required, Validators.maxLength(160)]],
    isActive: [true],
  });

  ngOnInit(): void {
    this.load();
  }

  get filtered(): UnspscCategory[] {
    const q = this.filter.trim().toLowerCase();
    if (!q) {
      return this.items;
    }
    return this.items.filter(
      (c) =>
        c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
    );
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.categories.list().subscribe({
      next: (res) => {
        this.items = res.items ?? [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load UNSPSC categories');
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

  openEdit(item: UnspscCategory): void {
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
      ? this.categories.update(this.editing.id, {
          code: value.code!.trim(),
          name: value.name!.trim(),
          isActive: !!value.isActive,
        })
      : this.categories.create({
          code: value.code!.trim(),
          name: value.name!.trim(),
        });

    request$.subscribe({
      next: () => {
        this.saving = false;
        this.modalRef?.close();
        this.toast.success(
          this.editing ? 'UNSPSC category updated' : 'UNSPSC category created',
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
