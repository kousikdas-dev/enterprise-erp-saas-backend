import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CreateSalesReturnRequest,
  ItemList,
  ReverseSalesReturnRequest,
  SalesReturn,
} from '../models/sales.models';

@Injectable({ providedIn: 'root' })
export class SalesReturnService {
  constructor(private readonly api: ApiClient) {}

  list(): Observable<ItemList<SalesReturn>> {
    return this.api.get<ItemList<SalesReturn>>('/api/v1/sales-returns');
  }

  getById(id: string): Observable<SalesReturn> {
    return this.api.get<SalesReturn>(`/api/v1/sales-returns/${id}`);
  }

  create(body: CreateSalesReturnRequest): Observable<SalesReturn> {
    return this.api.post<SalesReturn>('/api/v1/sales-returns', body);
  }

  confirm(id: string): Observable<SalesReturn> {
    return this.api.post<SalesReturn>(`/api/v1/sales-returns/${id}/confirm`);
  }

  /** Retries accounting posting for a CONFIRMED return whose journal posting previously failed. */
  retryAccountingPosting(id: string): Observable<SalesReturn> {
    return this.api.post<SalesReturn>(
      `/api/v1/sales-returns/${id}/retry-accounting-posting`,
    );
  }

  /** Undoes a CONFIRMED return: restores SalesInvoice.amountCredited / SalesInvoiceItem.returnedQuantity, reverses the journal. */
  reverse(id: string, body: ReverseSalesReturnRequest = {}): Observable<SalesReturn> {
    return this.api.post<SalesReturn>(`/api/v1/sales-returns/${id}/reverse`, body);
  }

  /** Retries accounting reversal for a REVERSED return whose journal reversal previously failed. */
  retryAccountingReversal(id: string): Observable<SalesReturn> {
    return this.api.post<SalesReturn>(
      `/api/v1/sales-returns/${id}/retry-accounting-reversal`,
    );
  }
}
