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
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AppPermissions } from '../../../core/permissions/permissions.constants';
import { PermissionService } from '../../../core/permissions/permission.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { MasterDataOption } from '../../../shared/master-data/master-data.models';
import { MasterDataService } from '../../../shared/master-data/master-data.service';
import {
  Supplier,
  SupplierAddress,
  SupplierAddressType,
} from '../models/purchase.models';
import { SupplierService } from './supplier.service';

const PHONE_PATTERN = /^[+0-9][0-9().\s-]{5,63}$/;
const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i;
const URL_PATTERN = /^https?:\/\/\S+$/i;

interface AddressOpResult {
  ok: boolean;
}

@Component({
  selector: 'app-supplier-list',
  templateUrl: './supplier-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class SupplierListComponent implements OnInit {
  @ViewChild('formModal') formModal!: TemplateRef<unknown>;
  @ViewChild('detailModal') detailModal!: TemplateRef<unknown>;

  private readonly suppliers = inject(SupplierService);
  private readonly masterData = inject(MasterDataService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canCreate = this.permissions.has(AppPermissions.SUPPLIERS_CREATE);
  readonly canUpdate = this.permissions.has(AppPermissions.SUPPLIERS_UPDATE);

  items: Supplier[] = [];
  loading = false;
  error: string | null = null;
  filter = '';
  saving = false;
  editing: Supplier | null = null;
  viewing: Supplier | null = null;
  private modalRef?: NgbModalRef;

  paymentTerms: MasterDataOption[] = [];
  fiscalPositions: MasterDataOption[] = [];
  industries: MasterDataOption[] = [];

  tags: string[] = [];
  tagInput = '';
  private removedAddressIds: string[] = [];

  form = this.fb.group({
    code: ['', [Validators.required, Validators.maxLength(32)]],
    name: ['', [Validators.required, Validators.maxLength(160)]],
    company: ['', [Validators.maxLength(160)]],
    email: ['', [Validators.email, Validators.maxLength(255)]],
    phone: ['', [Validators.maxLength(64), Validators.pattern(PHONE_PATTERN)]],
    jobPosition: ['', [Validators.maxLength(160)]],
    website: ['', [Validators.maxLength(255), Validators.pattern(URL_PATTERN)]],
    gstin: ['', [Validators.pattern(GSTIN_PATTERN)]],
    address: ['', [Validators.maxLength(255)]],
    paymentTermId: [''],
    fiscalPositionId: [''],
    industryId: [''],
    notes: ['', [Validators.maxLength(2000)]],
    isActive: [true],
    billingAddresses: this.fb.array<FormGroup>([]),
    dispatchAddresses: this.fb.array<FormGroup>([]),
  });

  ngOnInit(): void {
    this.loadLookups();
    this.load();
  }

  get billingAddresses(): FormArray<FormGroup> {
    return this.form.get('billingAddresses') as FormArray<FormGroup>;
  }

  get dispatchAddresses(): FormArray<FormGroup> {
    return this.form.get('dispatchAddresses') as FormArray<FormGroup>;
  }

  get filtered(): Supplier[] {
    const q = this.filter.trim().toLowerCase();
    if (!q) {
      return this.items;
    }
    return this.items.filter(
      (s) =>
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.company ?? '').toLowerCase().includes(q) ||
        (s.email ?? '').toLowerCase().includes(q) ||
        (s.phone ?? '').toLowerCase().includes(q),
    );
  }

  loadLookups(): void {
    forkJoin({
      paymentTerms: this.masterData.paymentTerms(),
      fiscalPositions: this.masterData.fiscalPositions(),
      industries: this.masterData.industries(),
    }).subscribe({
      next: (res) => {
        this.paymentTerms = res.paymentTerms.items ?? [];
        this.fiscalPositions = res.fiscalPositions.items ?? [];
        this.industries = res.industries.items ?? [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load supplier lookups'));
        this.cdr.detectChanges();
      },
    });
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.suppliers.list().subscribe({
      next: (res) => {
        this.items = res.items ?? [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load suppliers');
        this.cdr.detectChanges();
      },
    });
  }

  masterDataLabel(list: MasterDataOption[], id: string | null): string {
    if (!id) {
      return '—';
    }
    const m = list.find((x) => x.id === id);
    return m ? m.name : id.slice(0, 8);
  }

  createAddressGroup(addr?: Partial<SupplierAddress>): FormGroup {
    return this.fb.group({
      id: [addr?.id ?? null],
      name: [addr?.name ?? '', [Validators.required, Validators.maxLength(160)]],
      addressLine1: [
        addr?.addressLine1 ?? '',
        [Validators.required, Validators.maxLength(255)],
      ],
      addressLine2: [addr?.addressLine2 ?? '', [Validators.maxLength(255)]],
      city: [addr?.city ?? '', [Validators.required, Validators.maxLength(100)]],
      state: [addr?.state ?? '', [Validators.maxLength(100)]],
      postalCode: [addr?.postalCode ?? '', [Validators.maxLength(20)]],
      country: [
        addr?.country ?? '',
        [Validators.required, Validators.maxLength(100)],
      ],
      phone: [
        addr?.phone ?? '',
        [Validators.maxLength(64), Validators.pattern(PHONE_PATTERN)],
      ],
      isDefault: [addr?.isDefault ?? false],
    });
  }

  addBillingAddress(): void {
    this.billingAddresses.push(this.createAddressGroup());
  }

  removeBillingAddress(index: number): void {
    const id = this.billingAddresses.at(index).value.id as string | null;
    if (id) {
      this.removedAddressIds.push(id);
    }
    this.billingAddresses.removeAt(index);
  }

  addDispatchAddress(): void {
    this.dispatchAddresses.push(this.createAddressGroup());
  }

  removeDispatchAddress(index: number): void {
    const id = this.dispatchAddresses.at(index).value.id as string | null;
    if (id) {
      this.removedAddressIds.push(id);
    }
    this.dispatchAddresses.removeAt(index);
  }

  addTag(): void {
    const value = this.tagInput.trim();
    this.tagInput = '';
    if (!value) {
      return;
    }
    if (value.length > 64) {
      this.toast.error('Tags must be 64 characters or fewer.');
      return;
    }
    if (this.tags.includes(value)) {
      return;
    }
    this.tags = [...this.tags, value];
  }

  removeTag(index: number): void {
    this.tags = this.tags.filter((_, i) => i !== index);
  }

  openCreate(): void {
    if (!this.canCreate) {
      return;
    }
    this.editing = null;
    this.tags = [];
    this.tagInput = '';
    this.removedAddressIds = [];
    this.form.reset({
      code: '',
      name: '',
      company: '',
      email: '',
      phone: '',
      jobPosition: '',
      website: '',
      gstin: '',
      address: '',
      paymentTermId: '',
      fiscalPositionId: '',
      industryId: '',
      notes: '',
      isActive: true,
    });
    this.billingAddresses.clear();
    this.dispatchAddresses.clear();
    this.modalRef = this.modal.open(this.formModal, {
      centered: true,
      size: 'xl',
      scrollable: true,
    });
  }

  openEdit(item: Supplier): void {
    if (!this.canUpdate) {
      return;
    }
    this.editing = item;
    this.tags = [...(item.tags ?? [])];
    this.tagInput = '';
    this.removedAddressIds = [];
    this.form.reset({
      code: item.code,
      name: item.name,
      company: item.company ?? '',
      email: item.email ?? '',
      phone: item.phone ?? '',
      jobPosition: item.jobPosition ?? '',
      website: item.website ?? '',
      gstin: item.gstin ?? '',
      address: item.address ?? '',
      paymentTermId: item.paymentTermId ?? '',
      fiscalPositionId: item.fiscalPositionId ?? '',
      industryId: item.industryId ?? '',
      notes: item.notes ?? '',
      isActive: item.isActive,
    });
    this.billingAddresses.clear();
    this.dispatchAddresses.clear();
    for (const addr of item.addresses ?? []) {
      const group = this.createAddressGroup(addr);
      if (addr.type === 'BILLING') {
        this.billingAddresses.push(group);
      } else if (addr.type === 'DISPATCH') {
        this.dispatchAddresses.push(group);
      }
    }
    this.modalRef = this.modal.open(this.formModal, {
      centered: true,
      size: 'xl',
      scrollable: true,
    });
  }

  openDetail(item: Supplier): void {
    this.viewing = item;
    this.modal.open(this.detailModal, { centered: true, size: 'lg' });
    this.suppliers.getById(item.id).subscribe({
      next: (detail) => {
        this.viewing = detail;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load supplier details'));
        this.cdr.detectChanges();
      },
    });
  }

  billingAddressesOf(supplier: Supplier): SupplierAddress[] {
    return (supplier.addresses ?? []).filter((a) => a.type === 'BILLING');
  }

  dispatchAddressesOf(supplier: Supplier): SupplierAddress[] {
    return (supplier.addresses ?? []).filter((a) => a.type === 'DISPATCH');
  }

  save(): void {
    if (
      this.form.invalid ||
      this.billingAddresses.invalid ||
      this.dispatchAddresses.invalid ||
      this.saving
    ) {
      this.form.markAllAsTouched();
      this.billingAddresses.markAllAsTouched();
      this.dispatchAddresses.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const company = value.company?.trim() || undefined;
    const email = value.email?.trim() || undefined;
    const phone = value.phone?.trim() || undefined;
    const jobPosition = value.jobPosition?.trim() || undefined;
    const website = value.website?.trim() || undefined;
    const gstin = value.gstin?.trim() || undefined;
    const address = value.address?.trim() || undefined;
    const paymentTermId = value.paymentTermId || undefined;
    const fiscalPositionId = value.fiscalPositionId || undefined;
    const industryId = value.industryId || undefined;
    const notes = value.notes?.trim() || undefined;

    this.saving = true;
    this.cdr.detectChanges();

    const request$ = this.editing
      ? this.suppliers.update(this.editing.id, {
          code: value.code!.trim(),
          name: value.name!.trim(),
          company: company ?? null,
          email: email ?? null,
          phone: phone ?? null,
          jobPosition: jobPosition ?? null,
          website: website ?? null,
          tags: this.tags,
          gstin: gstin ?? null,
          address: address ?? null,
          paymentTermId: paymentTermId ?? null,
          fiscalPositionId: fiscalPositionId ?? null,
          industryId: industryId ?? null,
          notes: notes ?? null,
          isActive: !!value.isActive,
        })
      : this.suppliers.create({
          code: value.code!.trim(),
          name: value.name!.trim(),
          company,
          email,
          phone,
          jobPosition,
          website,
          tags: this.tags,
          gstin,
          address,
          paymentTermId,
          fiscalPositionId,
          industryId,
          notes,
        });

    request$.subscribe({
      next: (supplier) => this.syncAddresses(supplier.id),
      error: (err) => {
        this.saving = false;
        this.toast.error(apiErrorMessage(err, 'Save failed'));
        this.cdr.detectChanges();
      },
    });
  }

  private syncAddresses(supplierId: string): void {
    const ops: Observable<AddressOpResult>[] = [];

    for (const addressId of this.removedAddressIds) {
      ops.push(this.wrap(this.suppliers.deleteAddress(supplierId, addressId)));
    }
    for (const group of this.billingAddresses.controls) {
      ops.push(this.wrap(this.upsertAddress(supplierId, 'BILLING', group)));
    }
    for (const group of this.dispatchAddresses.controls) {
      ops.push(this.wrap(this.upsertAddress(supplierId, 'DISPATCH', group)));
    }

    if (ops.length === 0) {
      this.finishSave(true, 0);
      return;
    }

    forkJoin(ops).subscribe((results) => {
      const failed = results.filter((r) => !r.ok).length;
      this.finishSave(failed === 0, failed);
    });
  }

  private wrap(source: Observable<unknown>): Observable<AddressOpResult> {
    return source.pipe(
      map(() => ({ ok: true })),
      catchError(() => of({ ok: false })),
    );
  }

  private upsertAddress(
    supplierId: string,
    type: SupplierAddressType,
    group: FormGroup,
  ): Observable<unknown> {
    const v = group.getRawValue();
    if (v.id) {
      return this.suppliers.updateAddress(supplierId, v.id, {
        type,
        name: v.name.trim(),
        addressLine1: v.addressLine1.trim(),
        addressLine2: v.addressLine2?.trim() || null,
        city: v.city.trim(),
        state: v.state?.trim() || null,
        postalCode: v.postalCode?.trim() || null,
        country: v.country.trim(),
        phone: v.phone?.trim() || null,
        isDefault: !!v.isDefault,
      });
    }
    return this.suppliers.createAddress(supplierId, {
      type,
      name: v.name.trim(),
      addressLine1: v.addressLine1.trim(),
      addressLine2: v.addressLine2?.trim() || undefined,
      city: v.city.trim(),
      state: v.state?.trim() || undefined,
      postalCode: v.postalCode?.trim() || undefined,
      country: v.country.trim(),
      phone: v.phone?.trim() || undefined,
      isDefault: !!v.isDefault,
    });
  }

  private finishSave(fullSuccess: boolean, failedCount: number): void {
    this.saving = false;
    this.modalRef?.close();
    if (fullSuccess) {
      this.toast.success(this.editing ? 'Supplier updated' : 'Supplier created');
    } else {
      this.toast.error(
        `Supplier saved, but ${failedCount} address change(s) failed. Please review this supplier's addresses.`,
      );
    }
    this.load();
    this.cdr.detectChanges();
  }
}
