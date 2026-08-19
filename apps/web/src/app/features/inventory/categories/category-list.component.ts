import {
  Component,
  OnInit,
  TemplateRef,
  ViewChild,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { AppPermissions } from '../../../core/permissions/permissions.constants';
import { PermissionService } from '../../../core/permissions/permission.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { Category } from '../models/inventory.models';
import { CategoryService } from './category.service';

@Component({
  selector: 'app-category-list',
  templateUrl: './category-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class CategoryListComponent implements OnInit {
  @ViewChild('formModal') formModal!: TemplateRef<unknown>;

  private readonly categories = inject(CategoryService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);

  readonly canCreate = this.permissions.has(AppPermissions.CATEGORIES_CREATE);
  readonly canUpdate = this.permissions.has(AppPermissions.CATEGORIES_UPDATE);

  readonly items = signal<Category[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly filter = signal('');
  readonly saving = signal(false);
  editing: Category | null = null;
  private modalRef?: NgbModalRef;

  readonly filtered = computed(() => {
    const q = this.filter().trim().toLowerCase();
    const list = this.items();
    if (!q) {
      return list;
    }
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description ?? '').toLowerCase().includes(q),
    );
  });

  form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    description: ['', [Validators.maxLength(255)]],
    isActive: [true],
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.categories.list().subscribe({
      next: (res) => {
        this.items.set(res.items ?? []);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(err, 'Failed to load categories'));
      },
    });
  }

  openCreate(): void {
    if (!this.canCreate) {
      return;
    }
    this.editing = null;
    this.form.reset({ name: '', description: '', isActive: true });
    this.modalRef = this.modal.open(this.formModal, { centered: true });
  }

  openEdit(item: Category): void {
    if (!this.canUpdate) {
      return;
    }
    this.editing = item;
    this.form.reset({
      name: item.name,
      description: item.description ?? '',
      isActive: item.isActive,
    });
    this.modalRef = this.modal.open(this.formModal, { centered: true });
  }

  save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const description = value.description?.trim() || undefined;
    this.saving.set(true);

    const request$ = this.editing
      ? this.categories.update(this.editing.id, {
          name: value.name!.trim(),
          description,
          isActive: !!value.isActive,
        })
      : this.categories.create({
          name: value.name!.trim(),
          description,
        });

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.modalRef?.close();
        this.toast.success(this.editing ? 'Category updated' : 'Category created');
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(apiErrorMessage(err, 'Save failed'));
      },
    });
  }
}
