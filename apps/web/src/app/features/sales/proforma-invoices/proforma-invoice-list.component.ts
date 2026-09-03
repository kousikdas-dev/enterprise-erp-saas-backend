import {
  Component,
  OnInit,
  TemplateRef,
  ViewChild,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { Observable } from 'rxjs';
import { AppPermissions } from '../../../core/permissions/permissions.constants';
import { PermissionService } from '../../../core/permissions/permission.service';
import { ProductService } from '../../inventory/products/product.service';
import { Product } from '../../inventory/models/inventory.models';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  isPositiveDecimal,
  multiplyDecimals,
} from '../../../shared/utils/decimal.util';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { ProformaInvoice } from '../models/sales.models';
import { ProformaInvoiceService } from './proforma-invoice.service';

type ProformaInvoiceAction = 'send' | 'cancel' | 'invoice';

@Component({
  selector: 'app-proforma-invoice-list',
  templateUrl: './proforma-invoice-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class ProformaInvoiceListComponent implements OnInit {
  @ViewChild('formModal') formModal!: TemplateRef<unknown>;
  @ViewChild('detailModal') detailModal!: TemplateRef<unknown>;
  @ViewChild('actionModal') actionModal!: TemplateRef<unknown>;

  private readonly proformas = inject(ProformaInvoiceService);
  private readonly productService = inject(ProductService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canUpdate = this.permissions.has(AppPermissions.PROFORMA_INVOICES_UPDATE);
  readonly canSend = this.permissions.has(AppPermissions.PROFORMA_INVOICES_SEND);
  readonly canCancel = this.permissions.has(AppPermissions.PROFORMA_INVOICES_CANCEL);
  readonly canCreateInvoice = this.permissions.has(AppPermissions.SALES_INVOICES_CREATE);

  items: ProformaInvoice[] = [];
  products: Product[] = [];
  loading = false;
  error: string | null = null;
  filter = '';
  saving = false;
  actionBusy = false;
  editing: ProformaInvoice | null = null;
  viewing: ProformaInvoice | null = null;
  pendingAction: { type: ProformaInvoiceAction; proforma: ProformaInvoice } | null = null;
  private modalRef?: NgbModalRef;

  form = this.fb.group({
    notes: ['', Validators.maxLength(500)],
    billingAddress: ['', Validators.maxLength(500)],
    shippingAddress: ['', Validators.maxLength(500)],
    items: this.fb.array([this.createLineGroup()]),
  });

  ngOnInit(): void {
    this.productService.list().subscribe({
      next: (res) => {
        this.products = res.items ?? [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load products'));
        this.cdr.detectChanges();
      },
    });
    this.load();
  }

  get lines(): FormArray {
    return this.form.get('items') as FormArray;
  }

  get filtered(): ProformaInvoice[] {
    const q = this.filter.trim().toLowerCase();
    if (!q) {
      return this.items;
    }
    return this.items.filter(
      (p) =>
        p.documentNumber.toLowerCase().includes(q) ||
        p.status.toLowerCase().includes(q) ||
        p.customerName.toLowerCase().includes(q) ||
        p.sourceType.toLowerCase().includes(q),
    );
  }

  createLineGroup(productId = '', quantity = '', unitPrice = ''): FormGroup {
    return this.fb.group({
      productId: [productId, Validators.required],
      quantity: [
        quantity,
        [Validators.required, Validators.pattern(/^\d+(\.\d{1,6})?$/)],
      ],
      unitPrice: [
        unitPrice,
        [Validators.required, Validators.pattern(/^\d+(\.\d{1,4})?$/)],
      ],
    });
  }

  productLabel(id: string): string {
    const p = this.products.find((x) => x.id === id);
    return p ? `${p.sku} — ${p.name}` : id.slice(0, 8);
  }

  lineTotal(quantity: string, unitPrice: string): string {
    if (!quantity || !unitPrice) {
      return '—';
    }
    return multiplyDecimals(quantity, unitPrice, 4);
  }

  canEditProforma(p: ProformaInvoice): boolean {
    return this.canUpdate && p.status === 'DRAFT';
  }

  canSendProforma(p: ProformaInvoice): boolean {
    return this.canSend && p.status === 'DRAFT';
  }

  canCancelProforma(p: ProformaInvoice): boolean {
    return this.canCancel && (p.status === 'DRAFT' || p.status === 'ISSUED');
  }

  canCreateInvoiceFor(p: ProformaInvoice): boolean {
    return this.canCreateInvoice && p.status === 'ISSUED';
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.proformas.list().subscribe({
      next: (res) => {
        this.items = res.items ?? [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load proforma invoices');
        this.cdr.detectChanges();
      },
    });
  }

  addLine(): void {
    this.lines.push(this.createLineGroup());
  }

  removeLine(index: number): void {
    if (this.lines.length <= 1) {
      return;
    }
    this.lines.removeAt(index);
  }

  openEdit(item: ProformaInvoice): void {
    if (!this.canEditProforma(item)) {
      return;
    }
    this.editing = item;
    this.form.reset({
      notes: item.notes ?? '',
      billingAddress: item.billingAddress ?? '',
      shippingAddress: item.shippingAddress ?? '',
    });
    this.lines.clear();
    for (const line of item.items ?? []) {
      this.lines.push(
        this.createLineGroup(line.productId, line.quantity, line.unitPrice),
      );
    }
    if (this.lines.length === 0) {
      this.lines.push(this.createLineGroup());
    }
    this.modalRef = this.modal.open(this.formModal, { centered: true, size: 'xl' });
  }

  openDetail(item: ProformaInvoice): void {
    this.viewing = item;
    this.modal.open(this.detailModal, { centered: true, size: 'lg' });
    this.proformas.getById(item.id).subscribe({
      next: (detail) => {
        this.viewing = detail;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load proforma details'));
        this.cdr.detectChanges();
      },
    });
  }

  askAction(type: ProformaInvoiceAction, proforma: ProformaInvoice): void {
    this.pendingAction = { type, proforma };
    this.modal.open(this.actionModal, { centered: true });
  }

  actionLabel(type: ProformaInvoiceAction): string {
    switch (type) {
      case 'send':
        return 'Send proforma invoice';
      case 'cancel':
        return 'Cancel proforma invoice';
      case 'invoice':
        return 'Create sales invoice';
    }
  }

  runPendingAction(modal: { close: () => void }): void {
    if (!this.pendingAction || this.actionBusy) {
      return;
    }
    const { type, proforma } = this.pendingAction;
    this.actionBusy = true;
    this.cdr.detectChanges();

    const request$: Observable<unknown> =
      type === 'send'
        ? this.proformas.send(proforma.id)
        : type === 'cancel'
          ? this.proformas.cancel(proforma.id)
          : this.proformas.createInvoice(proforma.id);

    request$.subscribe({
      next: () => {
        this.actionBusy = false;
        modal.close();
        this.pendingAction = null;
        this.toast.success(`${this.actionLabel(type)} succeeded`);
        this.load();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.actionBusy = false;
        this.toast.error(apiErrorMessage(err, 'Action failed'));
        this.cdr.detectChanges();
      },
    });
  }

  save(): void {
    if (!this.editing || this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.lines.length === 0) {
      this.toast.error('Add at least one line.');
      return;
    }

    const rawLines = this.lines.getRawValue() as Array<{
      productId: string;
      quantity: string;
      unitPrice: string;
    }>;
    for (const line of rawLines) {
      if (!isPositiveDecimal(line.quantity) || !isPositiveDecimal(line.unitPrice)) {
        this.toast.error('Each line needs a positive quantity and unit price.');
        return;
      }
      if (!this.products.find((p) => p.id === line.productId)) {
        this.toast.error('Select a valid product for every line.');
        return;
      }
    }

    const value = this.form.getRawValue();
    const notes = value.notes?.trim() || undefined;
    const billingAddress = value.billingAddress?.trim() || undefined;
    const shippingAddress = value.shippingAddress?.trim() || undefined;
    const items = rawLines.map((line) => {
      const product = this.products.find((p) => p.id === line.productId)!;
      return {
        productId: line.productId,
        productSku: product.sku,
        productName: product.name,
        quantity: String(line.quantity).trim(),
        unitPrice: String(line.unitPrice).trim(),
      };
    });

    this.saving = true;
    this.cdr.detectChanges();

    this.proformas
      .update(this.editing.id, {
        notes: notes ?? null,
        billingAddress: billingAddress ?? null,
        shippingAddress: shippingAddress ?? null,
        items,
      })
      .subscribe({
        next: () => {
          this.saving = false;
          this.modalRef?.close();
          this.toast.success('Proforma invoice updated');
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
