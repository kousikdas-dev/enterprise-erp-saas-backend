import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import { ItemList, ProformaInvoice } from '../models/sales.models';

/** Read-only — proforma invoices are created via Quotation/Sales Order actions. */
@Injectable({ providedIn: 'root' })
export class ProformaInvoiceService {
  constructor(private readonly api: ApiClient) {}

  list(): Observable<ItemList<ProformaInvoice>> {
    return this.api.get<ItemList<ProformaInvoice>>('/v1/proforma-invoices');
  }

  getById(id: string): Observable<ProformaInvoice> {
    return this.api.get<ProformaInvoice>(`/v1/proforma-invoices/${id}`);
  }
}
