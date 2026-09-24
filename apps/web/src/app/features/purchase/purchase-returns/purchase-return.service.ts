import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CreatePurchaseReturnRequest,
  ItemList,
  PurchaseReturn,
  ReversePurchaseReturnRequest,
} from '../models/purchase.models';

@Injectable({ providedIn: 'root' })
export class PurchaseReturnService {
  constructor(private readonly api: ApiClient) {}

  list(): Observable<ItemList<PurchaseReturn>> {
    return this.api.get<ItemList<PurchaseReturn>>('/api/v1/purchase-returns');
  }

  getById(id: string): Observable<PurchaseReturn> {
    return this.api.get<PurchaseReturn>(`/api/v1/purchase-returns/${id}`);
  }

  create(body: CreatePurchaseReturnRequest): Observable<PurchaseReturn> {
    return this.api.post<PurchaseReturn>('/api/v1/purchase-returns', body);
  }

  confirm(id: string): Observable<PurchaseReturn> {
    return this.api.post<PurchaseReturn>(`/api/v1/purchase-returns/${id}/confirm`);
  }

  /** Retries accounting posting for a CONFIRMED return whose journal posting previously failed. */
  retryAccountingPosting(id: string): Observable<PurchaseReturn> {
    return this.api.post<PurchaseReturn>(
      `/api/v1/purchase-returns/${id}/retry-accounting-posting`,
    );
  }

  /** Undoes a CONFIRMED return: reverses Inventory, restores the return-quantity counters, reverses the journal. */
  reverse(id: string, body: ReversePurchaseReturnRequest = {}): Observable<PurchaseReturn> {
    return this.api.post<PurchaseReturn>(`/api/v1/purchase-returns/${id}/reverse`, body);
  }

  /** Retries accounting reversal for a REVERSED return whose journal reversal previously failed. */
  retryAccountingReversal(id: string): Observable<PurchaseReturn> {
    return this.api.post<PurchaseReturn>(
      `/api/v1/purchase-returns/${id}/retry-accounting-reversal`,
    );
  }
}
