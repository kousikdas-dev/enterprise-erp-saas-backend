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
import {
  ATTRIBUTE_DISPLAY_TYPES,
  ATTRIBUTE_VARIANT_CREATIONS,
  Attribute,
  AttributeDisplayType,
  AttributeVariantCreation,
} from '../models/inventory.models';
import { AttributeService } from './attribute.service';

interface ValueRow {
  id?: string;
  value: string;
  isCustom: boolean;
  extraPrice: string;
  saving?: boolean;
}

@Component({
  selector: 'app-attribute-list',
  templateUrl: './attribute-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class AttributeListComponent implements OnInit {
  @ViewChild('formModal') formModal!: TemplateRef<unknown>;

  private readonly attributes = inject(AttributeService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canCreate = this.permissions.has(AppPermissions.ATTRIBUTES_CREATE);
  readonly canUpdate = this.permissions.has(AppPermissions.ATTRIBUTES_UPDATE);

  readonly displayTypes = ATTRIBUTE_DISPLAY_TYPES;
  readonly variantCreations = ATTRIBUTE_VARIANT_CREATIONS;

  items: Attribute[] = [];
  loading = false;
  error: string | null = null;
  filter = '';
  saving = false;
  editing: Attribute | null = null;
  valueRows: ValueRow[] = [];
  private modalRef?: NgbModalRef;

  form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    displayType: ['RADIO' as AttributeDisplayType, Validators.required],
    variantCreation: ['INSTANTLY' as AttributeVariantCreation, Validators.required],
    isActive: [true],
  });

  ngOnInit(): void {
    this.load();
  }

  get filtered(): Attribute[] {
    const q = this.filter.trim().toLowerCase();
    if (!q) {
      return this.items;
    }
    return this.items.filter((a) => a.name.toLowerCase().includes(q));
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.attributes.list().subscribe({
      next: (res) => {
        this.items = res.items ?? [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load attributes');
        this.cdr.detectChanges();
      },
    });
  }

  openCreate(): void {
    if (!this.canCreate) {
      return;
    }
    this.editing = null;
    this.valueRows = [];
    this.form.reset({
      name: '',
      displayType: 'RADIO',
      variantCreation: 'INSTANTLY',
      isActive: true,
    });
    this.modalRef = this.modal.open(this.formModal, { centered: true, size: 'lg' });
  }

  openEdit(item: Attribute): void {
    if (!this.canUpdate) {
      return;
    }
    this.editing = item;
    this.loading = true;
    this.cdr.detectChanges();
    this.attributes.getById(item.id).subscribe({
      next: (full) => {
        this.valueRows = (full.values ?? []).map((v) => ({
          id: v.id,
          value: v.value,
          isCustom: v.isCustom,
          extraPrice: v.extraPrice,
        }));
        this.form.reset({
          name: full.name,
          displayType: full.displayType,
          variantCreation: full.variantCreation,
          isActive: full.isActive,
        });
        this.loading = false;
        this.modalRef = this.modal.open(this.formModal, { centered: true, size: 'lg' });
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.toast.error(apiErrorMessage(err, 'Failed to load attribute'));
        this.cdr.detectChanges();
      },
    });
  }

  addValueRow(): void {
    if (!this.editing) {
      this.valueRows.push({ value: '', isCustom: false, extraPrice: '0' });
      this.cdr.detectChanges();
      return;
    }
    const row: ValueRow = { value: '', isCustom: false, extraPrice: '0', saving: true };
    this.valueRows.push(row);
    this.cdr.detectChanges();
    this.attributes.addValue(this.editing.id, { value: '(new value)' }).subscribe({
      next: (created) => {
        row.id = created.id;
        row.value = created.value;
        row.extraPrice = created.extraPrice;
        row.saving = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.valueRows = this.valueRows.filter((r) => r !== row);
        this.toast.error(apiErrorMessage(err, 'Failed to add value'));
        this.cdr.detectChanges();
      },
    });
  }

  saveValueRow(row: ValueRow): void {
    if (!row.value.trim()) {
      return;
    }
    if (!this.editing || !row.id) {
      // New attribute (not yet saved) or row still being created — nothing to persist yet.
      return;
    }
    row.saving = true;
    this.cdr.detectChanges();
    this.attributes
      .updateValue(this.editing.id, row.id, {
        value: row.value.trim(),
        isCustom: row.isCustom,
        extraPrice: row.extraPrice,
      })
      .subscribe({
        next: () => {
          row.saving = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          row.saving = false;
          this.toast.error(apiErrorMessage(err, 'Failed to save value'));
          this.cdr.detectChanges();
        },
      });
  }

  removeValueRow(row: ValueRow): void {
    if (this.editing && row.id) {
      this.attributes.removeValue(this.editing.id, row.id).subscribe({
        next: () => {
          this.valueRows = this.valueRows.filter((r) => r !== row);
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.toast.error(apiErrorMessage(err, 'Failed to remove value'));
          this.cdr.detectChanges();
        },
      });
      return;
    }
    this.valueRows = this.valueRows.filter((r) => r !== row);
    this.cdr.detectChanges();
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
      ? this.attributes.update(this.editing.id, {
          name: value.name!.trim(),
          displayType: value.displayType!,
          variantCreation: value.variantCreation!,
          isActive: !!value.isActive,
        })
      : this.attributes.create({
          name: value.name!.trim(),
          displayType: value.displayType!,
          variantCreation: value.variantCreation!,
          values: this.valueRows
            .filter((r) => r.value.trim())
            .map((r) => ({
              value: r.value.trim(),
              isCustom: r.isCustom,
              extraPrice: r.extraPrice,
            })),
        });

    request$.subscribe({
      next: () => {
        this.saving = false;
        this.modalRef?.close();
        this.toast.success(this.editing ? 'Attribute updated' : 'Attribute created');
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
