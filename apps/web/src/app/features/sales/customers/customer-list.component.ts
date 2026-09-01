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
  SALESPERSON_ROLE,
  User,
} from '../../administration/models/administration.models';
import { UserService } from '../../administration/users/user.service';
import {
  Customer,
  CustomerAddress,
  CustomerAddressType,
} from '../models/sales.models';
import { CustomerService } from './customer.service';

const PHONE_PATTERN = /^[+0-9][0-9().\s-]{5,63}$/;
const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i;
const URL_PATTERN = /^https?:\/\/\S+$/i;

interface AddressOpResult {
  ok: boolean;
}

@Component({
  selector: 'app-customer-list',
  templateUrl: './customer-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class CustomerListComponent implements OnInit {
  @ViewChild('formModal') formModal!: TemplateRef<unknown>;
  @ViewChild('detailModal') detailModal!: TemplateRef<unknown>;

  private readonly customers = inject(CustomerService);
  private readonly masterData = inject(MasterDataService);
  private readonly users = inject(UserService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canCreate = this.permissions.has(AppPermissions.CUSTOMERS_CREATE);
  readonly canUpdate = this.permissions.has(AppPermissions.CUSTOMERS_UPDATE);

  items: Customer[] = [];
  loading = false;
  error: string | null = null;
  filter = '';
  saving = false;
  editing: Customer | null = null;
  viewing: Customer | null = null;
  private modalRef?: NgbModalRef;

  salespeople: User[] = [];
  paymentTerms: MasterDataOption[] = [];
  paymentMethods: MasterDataOption[] = [];
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
    salespersonId: [''],
    paymentTermId: [''],
    paymentMethodId: [''],
    fiscalPositionId: [''],
    industryId: [''],
    street: ['', [Validators.maxLength(255)]],
    street2: ['', [Validators.maxLength(255)]],
    city: ['', [Validators.maxLength(120)]],
    zip: ['', [Validators.maxLength(32)]],
    state: ['', [Validators.maxLength(120)]],
    country: ['', [Validators.maxLength(120)]],
    isActive: [true],
    billingAddresses: this.fb.array<FormGroup>([]),
    shippingAddresses: this.fb.array<FormGroup>([]),
  });

  ngOnInit(): void {
    this.loadLookups();
    this.load();
  }

  get billingAddresses(): FormArray<FormGroup> {
    return this.form.get('billingAddresses') as FormArray<FormGroup>;
  }

  get shippingAddresses(): FormArray<FormGroup> {
    return this.form.get('shippingAddresses') as FormArray<FormGroup>;
  }

  get filtered(): Customer[] {
    const q = this.filter.trim().toLowerCase();
    if (!q) {
      return this.items;
    }
    return this.items.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        (c.company ?? '').toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q) ||
        (c.phone ?? '').toLowerCase().includes(q),
    );
  }

  loadLookups(): void {
    forkJoin({
      salespeople: this.users.list({ role: SALESPERSON_ROLE }),
      paymentTerms: this.masterData.paymentTerms(),
      paymentMethods: this.masterData.paymentMethods(),
      fiscalPositions: this.masterData.fiscalPositions(),
      industries: this.masterData.industries(),
    }).subscribe({
      next: (res) => {
        this.salespeople = (res.salespeople.items ?? []).filter(
          (u) => u.status === 'ACTIVE',
        );
        this.paymentTerms = res.paymentTerms.items ?? [];
        this.paymentMethods = res.paymentMethods.items ?? [];
        this.fiscalPositions = res.fiscalPositions.items ?? [];
        this.industries = res.industries.items ?? [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load customer lookups'));
        this.cdr.detectChanges();
      },
    });
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.customers.list().subscribe({
      next: (res) => {
        this.items = res.items ?? [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load customers');
        this.cdr.detectChanges();
      },
    });
  }

  salespersonLabel(id: string | null): string {
    if (!id) {
      return '—';
    }
    const u = this.salespeople.find((x) => x.id === id);
    return u ? `${u.firstName} ${u.lastName}`.trim() || u.email : id.slice(0, 8);
  }

  masterDataLabel(list: MasterDataOption[], id: string | null): string {
    if (!id) {
      return '—';
    }
    const m = list.find((x) => x.id === id);
    return m ? m.name : id.slice(0, 8);
  }

  createAddressGroup(addr?: Partial<CustomerAddress>): FormGroup {
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

  addShippingAddress(): void {
    this.shippingAddresses.push(this.createAddressGroup());
  }

  removeShippingAddress(index: number): void {
    const id = this.shippingAddresses.at(index).value.id as string | null;
    if (id) {
      this.removedAddressIds.push(id);
    }
    this.shippingAddresses.removeAt(index);
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
      salespersonId: '',
      paymentTermId: '',
      paymentMethodId: '',
      fiscalPositionId: '',
      industryId: '',
      street: '',
      street2: '',
      city: '',
      zip: '',
      state: '',
      country: '',
      isActive: true,
    });
    this.billingAddresses.clear();
    this.shippingAddresses.clear();
    this.modalRef = this.modal.open(this.formModal, {
      centered: true,
      size: 'xl',
      scrollable: true,
    });
  }

  openEdit(item: Customer): void {
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
      salespersonId: item.salespersonId ?? '',
      paymentTermId: item.paymentTermId ?? '',
      paymentMethodId: item.paymentMethodId ?? '',
      fiscalPositionId: item.fiscalPositionId ?? '',
      industryId: item.industryId ?? '',
      street: item.street ?? '',
      street2: item.street2 ?? '',
      city: item.city ?? '',
      zip: item.zip ?? '',
      state: item.state ?? '',
      country: item.country ?? '',
      isActive: item.isActive,
    });
    this.billingAddresses.clear();
    this.shippingAddresses.clear();
    for (const addr of item.addresses ?? []) {
      const group = this.createAddressGroup(addr);
      if (addr.type === 'BILLING') {
        this.billingAddresses.push(group);
      } else if (addr.type === 'SHIPPING') {
        this.shippingAddresses.push(group);
      }
    }
    this.modalRef = this.modal.open(this.formModal, {
      centered: true,
      size: 'xl',
      scrollable: true,
    });
  }

  openDetail(item: Customer): void {
    this.viewing = item;
    this.modal.open(this.detailModal, { centered: true, size: 'lg' });
    this.customers.getById(item.id).subscribe({
      next: (detail) => {
        this.viewing = detail;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load customer details'));
        this.cdr.detectChanges();
      },
    });
  }

  billingAddressesOf(customer: Customer): CustomerAddress[] {
    return (customer.addresses ?? []).filter((a) => a.type === 'BILLING');
  }

  shippingAddressesOf(customer: Customer): CustomerAddress[] {
    return (customer.addresses ?? []).filter((a) => a.type === 'SHIPPING');
  }

  save(): void {
    if (
      this.form.invalid ||
      this.billingAddresses.invalid ||
      this.shippingAddresses.invalid ||
      this.saving
    ) {
      this.form.markAllAsTouched();
      this.billingAddresses.markAllAsTouched();
      this.shippingAddresses.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const company = value.company?.trim() || undefined;
    const email = value.email?.trim() || undefined;
    const phone = value.phone?.trim() || undefined;
    const jobPosition = value.jobPosition?.trim() || undefined;
    const website = value.website?.trim() || undefined;
    const gstin = value.gstin?.trim() || undefined;
    const salespersonId = value.salespersonId || undefined;
    const paymentTermId = value.paymentTermId || undefined;
    const paymentMethodId = value.paymentMethodId || undefined;
    const fiscalPositionId = value.fiscalPositionId || undefined;
    const industryId = value.industryId || undefined;
    const street = value.street?.trim() || undefined;
    const street2 = value.street2?.trim() || undefined;
    const city = value.city?.trim() || undefined;
    const zip = value.zip?.trim() || undefined;
    const state = value.state?.trim() || undefined;
    const country = value.country?.trim() || undefined;

    this.saving = true;
    this.cdr.detectChanges();

    const request$ = this.editing
      ? this.customers.update(this.editing.id, {
          code: value.code!.trim(),
          name: value.name!.trim(),
          company: company ?? null,
          email: email ?? null,
          phone: phone ?? null,
          jobPosition: jobPosition ?? null,
          website: website ?? null,
          tags: this.tags,
          gstin: gstin ?? null,
          salespersonId: salespersonId ?? null,
          paymentTermId: paymentTermId ?? null,
          paymentMethodId: paymentMethodId ?? null,
          fiscalPositionId: fiscalPositionId ?? null,
          industryId: industryId ?? null,
          street: street ?? null,
          street2: street2 ?? null,
          city: city ?? null,
          zip: zip ?? null,
          state: state ?? null,
          country: country ?? null,
          isActive: !!value.isActive,
        })
      : this.customers.create({
          code: value.code!.trim(),
          name: value.name!.trim(),
          company,
          email,
          phone,
          jobPosition,
          website,
          tags: this.tags,
          gstin,
          salespersonId,
          paymentTermId,
          paymentMethodId,
          fiscalPositionId,
          industryId,
          street,
          street2,
          city,
          zip,
          state,
          country,
        });

    request$.subscribe({
      next: (customer) => this.syncAddresses(customer.id),
      error: (err) => {
        this.saving = false;
        this.toast.error(apiErrorMessage(err, 'Save failed'));
        this.cdr.detectChanges();
      },
    });
  }

  private syncAddresses(customerId: string): void {
    const ops: Observable<AddressOpResult>[] = [];

    for (const addressId of this.removedAddressIds) {
      ops.push(this.wrap(this.customers.deleteAddress(customerId, addressId)));
    }
    for (const group of this.billingAddresses.controls) {
      ops.push(this.wrap(this.upsertAddress(customerId, 'BILLING', group)));
    }
    for (const group of this.shippingAddresses.controls) {
      ops.push(this.wrap(this.upsertAddress(customerId, 'SHIPPING', group)));
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
    customerId: string,
    type: CustomerAddressType,
    group: FormGroup,
  ): Observable<unknown> {
    const v = group.getRawValue();
    if (v.id) {
      return this.customers.updateAddress(customerId, v.id, {
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
    return this.customers.createAddress(customerId, {
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
      this.toast.success(this.editing ? 'Customer updated' : 'Customer created');
    } else {
      this.toast.error(
        `Customer saved, but ${failedCount} address change(s) failed. Please review this customer's addresses.`,
      );
    }
    this.load();
    this.cdr.detectChanges();
  }
}
