import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CreateInvoiceFromSourceRequest,
  ItemList,
  ProformaInvoice,
  SalesInvoice,
  UpdateProformaInvoiceRequest,
} from '../models/sales.models';

/** Created via Quotation/Sales Order actions; editable only while DRAFT. */
@Injectable({ providedIn: 'root' })
export class ProformaInvoiceService {
  constructor(private readonly api: ApiClient) {}

  list(): Observable<ItemList<ProformaInvoice>> {
    return this.api.get<ItemList<ProformaInvoice>>('/v1/proforma-invoices');
  }

  getById(id: string): Observable<ProformaInvoice> {
    return this.api.get<ProformaInvoice>(`/v1/proforma-invoices/${id}`);
  }

  update(id: string, body: UpdateProformaInvoiceRequest): Observable<ProformaInvoice> {
    return this.api.patch<ProformaInvoice>(`/v1/proforma-invoices/${id}`, body);
  }

  send(id: string): Observable<ProformaInvoice> {
    return this.api.post<ProformaInvoice>(`/v1/proforma-invoices/${id}/send`);
  }

  cancel(id: string): Observable<ProformaInvoice> {
    return this.api.post<ProformaInvoice>(`/v1/proforma-invoices/${id}/cancel`);
  }

  createInvoice(
    id: string,
    body?: CreateInvoiceFromSourceRequest,
  ): Observable<SalesInvoice> {
    return this.api.post<SalesInvoice>(`/v1/proforma-invoices/${id}/invoice`, body);
  }
}
