import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CreateSalesInvoiceRequest,
  ItemList,
  SalesInvoice,
  UpdateSalesInvoiceRequest,
} from '../models/sales.models';

@Injectable({ providedIn: 'root' })
export class SalesInvoiceService {
  constructor(private readonly api: ApiClient) {}

  list(): Observable<ItemList<SalesInvoice>> {
    return this.api.get<ItemList<SalesInvoice>>('/api/v1/sales-invoices');
  }

  getById(id: string): Observable<SalesInvoice> {
    return this.api.get<SalesInvoice>(`/api/v1/sales-invoices/${id}`);
  }

  create(body: CreateSalesInvoiceRequest): Observable<SalesInvoice> {
    return this.api.post<SalesInvoice>('/api/v1/sales-invoices', body);
  }

  update(id: string, body: UpdateSalesInvoiceRequest): Observable<SalesInvoice> {
    return this.api.patch<SalesInvoice>(`/api/v1/sales-invoices/${id}`, body);
  }

  send(id: string): Observable<SalesInvoice> {
    return this.api.post<SalesInvoice>(`/api/v1/sales-invoices/${id}/send`);
  }

  cancel(id: string): Observable<SalesInvoice> {
    return this.api.post<SalesInvoice>(`/api/v1/sales-invoices/${id}/cancel`);
  }
}
