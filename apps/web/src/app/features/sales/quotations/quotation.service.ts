import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CreateQuotationRequest,
  ItemList,
  ProformaInvoice,
  Quotation,
  SalesOrder,
  UpdateQuotationRequest,
} from '../models/sales.models';

@Injectable({ providedIn: 'root' })
export class QuotationService {
  constructor(private readonly api: ApiClient) {}

  list(): Observable<ItemList<Quotation>> {
    return this.api.get<ItemList<Quotation>>('/v1/quotations');
  }

  getById(id: string): Observable<Quotation> {
    return this.api.get<Quotation>(`/v1/quotations/${id}`);
  }

  create(body: CreateQuotationRequest): Observable<Quotation> {
    return this.api.post<Quotation>('/v1/quotations', body);
  }

  update(id: string, body: UpdateQuotationRequest): Observable<Quotation> {
    return this.api.patch<Quotation>(`/v1/quotations/${id}`, body);
  }

  send(id: string): Observable<Quotation> {
    return this.api.post<Quotation>(`/v1/quotations/${id}/send`);
  }

  accept(id: string): Observable<Quotation> {
    return this.api.post<Quotation>(`/v1/quotations/${id}/accept`);
  }

  reject(id: string): Observable<Quotation> {
    return this.api.post<Quotation>(`/v1/quotations/${id}/reject`);
  }

  cancel(id: string): Observable<Quotation> {
    return this.api.post<Quotation>(`/v1/quotations/${id}/cancel`);
  }

  createProforma(id: string): Observable<ProformaInvoice> {
    return this.api.post<ProformaInvoice>(`/v1/quotations/${id}/proforma`);
  }

  convertToOrder(id: string): Observable<SalesOrder> {
    return this.api.post<SalesOrder>(`/v1/quotations/${id}/convert-to-order`);
  }
}
