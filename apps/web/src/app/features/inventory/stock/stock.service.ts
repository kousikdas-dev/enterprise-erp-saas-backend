import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CreateStockAdjustmentRequest,
  ItemList,
  StockAdjustmentResult,
  StockBalance,
  StockQuery,
} from '../models/inventory.models';

@Injectable({ providedIn: 'root' })
export class StockService {
  constructor(private readonly api: ApiClient) {}

  list(query?: StockQuery): Observable<ItemList<StockBalance>> {
    return this.api.get<ItemList<StockBalance>>('/v1/stock', query);
  }

  adjust(body: CreateStockAdjustmentRequest): Observable<StockAdjustmentResult> {
    return this.api.post<StockAdjustmentResult>('/v1/stock-adjustments', body);
  }
}
