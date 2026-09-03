import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CreateInvoiceFromSourceRequest,
  CreateSalesOrderRequest,
  ItemList,
  ProformaInvoice,
  SalesInvoice,
  SalesOrder,
  UpdateSalesOrderRequest,
} from '../models/sales.models';

@Injectable({ providedIn: 'root' })
export class SalesOrderService {
  constructor(private readonly api: ApiClient) {}

  list(): Observable<ItemList<SalesOrder>> {
    return this.api.get<ItemList<SalesOrder>>('/v1/sales-orders');
  }

  getById(id: string): Observable<SalesOrder> {
    return this.api.get<SalesOrder>(`/v1/sales-orders/${id}`);
  }

  create(body: CreateSalesOrderRequest): Observable<SalesOrder> {
    return this.api.post<SalesOrder>('/v1/sales-orders', body);
  }

  update(id: string, body: UpdateSalesOrderRequest): Observable<SalesOrder> {
    return this.api.patch<SalesOrder>(`/v1/sales-orders/${id}`, body);
  }

  confirm(id: string): Observable<SalesOrder> {
    return this.api.post<SalesOrder>(`/v1/sales-orders/${id}/confirm`);
  }

  cancel(id: string): Observable<SalesOrder> {
    return this.api.post<SalesOrder>(`/v1/sales-orders/${id}/cancel`);
  }

  createProforma(id: string): Observable<ProformaInvoice> {
    return this.api.post<ProformaInvoice>(`/v1/sales-orders/${id}/proforma`);
  }

  createInvoice(
    id: string,
    body?: CreateInvoiceFromSourceRequest,
  ): Observable<SalesInvoice> {
    return this.api.post<SalesInvoice>(`/v1/sales-orders/${id}/invoice`, body);
  }
}
