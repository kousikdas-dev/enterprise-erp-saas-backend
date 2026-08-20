import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CreateGoodsReceiptRequest,
  GoodsReceipt,
  ItemList,
} from '../models/purchase.models';

@Injectable({ providedIn: 'root' })
export class GoodsReceiptService {
  constructor(private readonly api: ApiClient) {}

  list(): Observable<ItemList<GoodsReceipt>> {
    return this.api.get<ItemList<GoodsReceipt>>('/v1/goods-receipts');
  }

  getById(id: string): Observable<GoodsReceipt> {
    return this.api.get<GoodsReceipt>(`/v1/goods-receipts/${id}`);
  }

  create(body: CreateGoodsReceiptRequest): Observable<GoodsReceipt> {
    return this.api.post<GoodsReceipt>('/v1/goods-receipts', body);
  }

  /** Retries Inventory posting for PENDING_STOCK receipts (Gateway POST /:id/post). */
  post(id: string): Observable<GoodsReceipt> {
    return this.api.post<GoodsReceipt>(`/v1/goods-receipts/${id}/post`);
  }
}
