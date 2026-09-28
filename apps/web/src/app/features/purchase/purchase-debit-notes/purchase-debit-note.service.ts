import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CreatePurchaseDebitNoteRequest,
  ItemList,
  PurchaseDebitNote,
  ReversePurchaseDebitNoteRequest,
} from '../models/purchase.models';

@Injectable({ providedIn: 'root' })
export class PurchaseDebitNoteService {
  constructor(private readonly api: ApiClient) {}

  list(): Observable<ItemList<PurchaseDebitNote>> {
    return this.api.get<ItemList<PurchaseDebitNote>>('/api/v1/purchase-debit-notes');
  }

  getById(id: string): Observable<PurchaseDebitNote> {
    return this.api.get<PurchaseDebitNote>(`/api/v1/purchase-debit-notes/${id}`);
  }

  create(body: CreatePurchaseDebitNoteRequest): Observable<PurchaseDebitNote> {
    return this.api.post<PurchaseDebitNote>('/api/v1/purchase-debit-notes', body);
  }

  /** DRAFT -> POSTED. Posts the accounting journal. Idempotent if already POSTED. */
  post(id: string): Observable<PurchaseDebitNote> {
    return this.api.post<PurchaseDebitNote>(`/api/v1/purchase-debit-notes/${id}/post`);
  }

  /** Retries accounting posting for a POSTED debit note whose journal posting previously failed. */
  retryAccountingPosting(id: string): Observable<PurchaseDebitNote> {
    return this.api.post<PurchaseDebitNote>(
      `/api/v1/purchase-debit-notes/${id}/retry-accounting-posting`,
    );
  }

  /** POSTED -> REVERSED. Never deletes the document or VOIDs the original journal. */
  reverse(id: string, body: ReversePurchaseDebitNoteRequest = {}): Observable<PurchaseDebitNote> {
    return this.api.post<PurchaseDebitNote>(`/api/v1/purchase-debit-notes/${id}/reverse`, body);
  }

  /** Retries accounting reversal for a REVERSED debit note whose journal reversal previously failed. */
  retryAccountingReversal(id: string): Observable<PurchaseDebitNote> {
    return this.api.post<PurchaseDebitNote>(
      `/api/v1/purchase-debit-notes/${id}/retry-accounting-reversal`,
    );
  }
}
