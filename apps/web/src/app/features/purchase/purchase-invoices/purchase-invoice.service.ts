import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CreatePurchaseInvoiceRequest,
  CreateSupplierPaymentRequest,
  ItemList,
  PurchaseInvoice,
  RecordSupplierPaymentResult,
  ReverseSupplierPaymentRequest,
  SupplierPayment,
  UpdatePurchaseInvoiceRequest,
} from '../models/purchase.models';

@Injectable({ providedIn: 'root' })
export class PurchaseInvoiceService {
  constructor(private readonly api: ApiClient) {}

  list(): Observable<ItemList<PurchaseInvoice>> {
    return this.api.get<ItemList<PurchaseInvoice>>('/api/v1/purchase-invoices');
  }

  getById(id: string): Observable<PurchaseInvoice> {
    return this.api.get<PurchaseInvoice>(`/api/v1/purchase-invoices/${id}`);
  }

  create(body: CreatePurchaseInvoiceRequest): Observable<PurchaseInvoice> {
    return this.api.post<PurchaseInvoice>('/api/v1/purchase-invoices', body);
  }

  update(id: string, body: UpdatePurchaseInvoiceRequest): Observable<PurchaseInvoice> {
    return this.api.patch<PurchaseInvoice>(`/api/v1/purchase-invoices/${id}`, body);
  }

  confirm(id: string): Observable<PurchaseInvoice> {
    return this.api.post<PurchaseInvoice>(`/api/v1/purchase-invoices/${id}/confirm`);
  }

  cancel(id: string): Observable<PurchaseInvoice> {
    return this.api.post<PurchaseInvoice>(`/api/v1/purchase-invoices/${id}/cancel`);
  }

  retryAccountingPosting(id: string): Observable<PurchaseInvoice> {
    return this.api.post<PurchaseInvoice>(
      `/api/v1/purchase-invoices/${id}/retry-accounting-posting`,
    );
  }

  retryAccountingReversal(id: string): Observable<PurchaseInvoice> {
    return this.api.post<PurchaseInvoice>(
      `/api/v1/purchase-invoices/${id}/retry-accounting-reversal`,
    );
  }

  recordPayment(
    id: string,
    body: CreateSupplierPaymentRequest,
  ): Observable<RecordSupplierPaymentResult> {
    return this.api.post<RecordSupplierPaymentResult>(
      `/api/v1/purchase-invoices/${id}/payments`,
      body,
    );
  }

  listPayments(id: string): Observable<ItemList<SupplierPayment>> {
    return this.api.get<ItemList<SupplierPayment>>(
      `/api/v1/purchase-invoices/${id}/payments`,
    );
  }

  retryPaymentAccountingPosting(
    id: string,
    paymentId: string,
  ): Observable<SupplierPayment> {
    return this.api.post<SupplierPayment>(
      `/api/v1/purchase-invoices/${id}/payments/${paymentId}/retry-accounting-posting`,
    );
  }

  reversePayment(
    id: string,
    paymentId: string,
    body: ReverseSupplierPaymentRequest = {},
  ): Observable<RecordSupplierPaymentResult> {
    return this.api.post<RecordSupplierPaymentResult>(
      `/api/v1/purchase-invoices/${id}/payments/${paymentId}/reverse`,
      body,
    );
  }

  retryPaymentAccountingReversal(
    id: string,
    paymentId: string,
  ): Observable<SupplierPayment> {
    return this.api.post<SupplierPayment>(
      `/api/v1/purchase-invoices/${id}/payments/${paymentId}/retry-accounting-reversal`,
    );
  }
}
