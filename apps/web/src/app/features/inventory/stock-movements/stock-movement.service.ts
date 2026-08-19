import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  ItemList,
  StockMovement,
  StockMovementQuery,
} from '../models/inventory.models';

@Injectable({ providedIn: 'root' })
export class StockMovementService {
  constructor(private readonly api: ApiClient) {}

  list(query?: StockMovementQuery): Observable<ItemList<StockMovement>> {
    return this.api.get<ItemList<StockMovement>>('/v1/stock-movements', query);
  }

  getById(id: string): Observable<StockMovement> {
    return this.api.get<StockMovement>(`/v1/stock-movements/${id}`);
  }
}
