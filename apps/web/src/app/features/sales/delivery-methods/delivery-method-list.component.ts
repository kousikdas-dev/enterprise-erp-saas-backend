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
import { DeliveryMethod } from '../models/sales.models';
import { DeliveryMethodService } from './delivery-method.service';

@Component({
  selector: 'app-delivery-method-list',
  templateUrl: './delivery-method-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class DeliveryMethodListComponent implements OnInit {
  @ViewChild('formModal') formModal!: TemplateRef<unknown>;

  private readonly deliveryMethods = inject(DeliveryMethodService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canCreate = this.permissions.has(
    AppPermissions.DELIVERY_METHODS_CREATE,
  );
  readonly canUpdate = this.permissions.has(
    AppPermissions.DELIVERY_METHODS_UPDATE,
  );

  items: DeliveryMethod[] = [];
  loading = false;
  error: string | null = null;
  filter = '';
  saving = false;
  editing: DeliveryMethod | null = null;
  private modalRef?: NgbModalRef;

  form = this.fb.group({
    code: ['', [Validators.required, Validators.maxLength(32)]],
    name: ['', [Validators.required, Validators.maxLength(120)]],
    price: [0, [Validators.required, Validators.min(0)]],
    isActive: [true],
  });

  ngOnInit(): void {
    this.load();
  }

  get filtered(): DeliveryMethod[] {
    const q = this.filter.trim().toLowerCase();
    if (!q) {
      return this.items;
    }
    return this.items.filter(
      (d) =>
        d.code.toLowerCase().includes(q) || d.name.toLowerCase().includes(q),
    );
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.deliveryMethods.list().subscribe({
      next: (res) => {
        this.items = res.items ?? [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load delivery methods');
        this.cdr.detectChanges();
      },
    });
  }

  openCreate(): void {
    if (!this.canCreate) {
      return;
    }
    this.editing = null;
    this.form.reset({ code: '', name: '', price: 0, isActive: true });
    this.modalRef = this.modal.open(this.formModal, { centered: true });
  }

  openEdit(item: DeliveryMethod): void {
    if (!this.canUpdate) {
      return;
    }
    this.editing = item;
    this.form.reset({
      code: item.code,
      name: item.name,
      price: Number(item.price),
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
      ? this.deliveryMethods.update(this.editing.id, {
          code: value.code!.trim(),
          name: value.name!.trim(),
          price: String(value.price),
          isActive: !!value.isActive,
        })
      : this.deliveryMethods.create({
          code: value.code!.trim(),
          name: value.name!.trim(),
          price: String(value.price),
        });

    request$.subscribe({
      next: () => {
        this.saving = false;
        this.modalRef?.close();
        this.toast.success(
          this.editing ? 'Delivery method updated' : 'Delivery method created',
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
