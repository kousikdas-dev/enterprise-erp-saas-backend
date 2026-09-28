import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CreateSalesCreditNoteRequest,
  ItemList,
  SalesCreditNote,
  ReverseSalesCreditNoteRequest,
} from '../models/sales.models';

@Injectable({ providedIn: 'root' })
export class SalesCreditNoteService {
  constructor(private readonly api: ApiClient) {}

  list(): Observable<ItemList<SalesCreditNote>> {
    return this.api.get<ItemList<SalesCreditNote>>('/api/v1/sales-credit-notes');
  }

  getById(id: string): Observable<SalesCreditNote> {
    return this.api.get<SalesCreditNote>(`/api/v1/sales-credit-notes/${id}`);
  }

  create(body: CreateSalesCreditNoteRequest): Observable<SalesCreditNote> {
    return this.api.post<SalesCreditNote>('/api/v1/sales-credit-notes', body);
  }

  /** DRAFT -> POSTED. Posts the accounting journal. Idempotent if already POSTED. */
  post(id: string): Observable<SalesCreditNote> {
    return this.api.post<SalesCreditNote>(`/api/v1/sales-credit-notes/${id}/post`);
  }

  /** Retries accounting posting for a POSTED credit note whose journal posting previously failed. */
  retryAccountingPosting(id: string): Observable<SalesCreditNote> {
    return this.api.post<SalesCreditNote>(
      `/api/v1/sales-credit-notes/${id}/retry-accounting-posting`,
    );
  }

  /** POSTED -> REVERSED. Never deletes the document or VOIDs the original journal. */
  reverse(id: string, body: ReverseSalesCreditNoteRequest = {}): Observable<SalesCreditNote> {
    return this.api.post<SalesCreditNote>(`/api/v1/sales-credit-notes/${id}/reverse`, body);
  }

  /** Retries accounting reversal for a REVERSED credit note whose journal reversal previously failed. */
  retryAccountingReversal(id: string): Observable<SalesCreditNote> {
    return this.api.post<SalesCreditNote>(
      `/api/v1/sales-credit-notes/${id}/retry-accounting-reversal`,
    );
  }
}
