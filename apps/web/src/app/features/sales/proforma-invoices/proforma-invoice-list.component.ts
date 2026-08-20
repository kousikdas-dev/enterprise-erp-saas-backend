import {
  Component,
  OnInit,
  TemplateRef,
  ViewChild,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { ToastService } from '../../../shared/toast/toast.service';
import { ProformaInvoice } from '../models/sales.models';
import { ProformaInvoiceService } from './proforma-invoice.service';

@Component({
  selector: 'app-proforma-invoice-list',
  templateUrl: './proforma-invoice-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class ProformaInvoiceListComponent implements OnInit {
  @ViewChild('detailModal') detailModal!: TemplateRef<unknown>;

  private readonly proformas = inject(ProformaInvoiceService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef);

  items: ProformaInvoice[] = [];
  loading = false;
  error: string | null = null;
  filter = '';
  viewing: ProformaInvoice | null = null;

  ngOnInit(): void {
    this.load();
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
}
