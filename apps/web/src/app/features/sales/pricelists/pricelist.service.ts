import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CreatePricelistItemRequest,
  CreatePricelistRequest,
  ItemList,
  Pricelist,
  PricelistItem,
  UpdatePricelistItemRequest,
  UpdatePricelistRequest,
} from '../models/sales.models';

/** Not in the gateway's globalPrefixExcludes list, so (unlike Customers/Quotations) this keeps the 'api' prefix. */
@Injectable({ providedIn: 'root' })
export class PricelistService {
  constructor(private readonly api: ApiClient) {}

  list(): Observable<ItemList<Pricelist>> {
    return this.api.get<ItemList<Pricelist>>('/api/v1/pricelists');
  }

  getById(id: string): Observable<Pricelist> {
    return this.api.get<Pricelist>(`/api/v1/pricelists/${id}`);
  }

  create(body: CreatePricelistRequest): Observable<Pricelist> {
    return this.api.post<Pricelist>('/api/v1/pricelists', body);
  }

  update(id: string, body: UpdatePricelistRequest): Observable<Pricelist> {
    return this.api.patch<Pricelist>(`/api/v1/pricelists/${id}`, body);
  }

  addItem(
    pricelistId: string,
    body: CreatePricelistItemRequest,
  ): Observable<PricelistItem> {
    return this.api.post<PricelistItem>(
      `/api/v1/pricelists/${pricelistId}/items`,
      body,
    );
  }

  updateItem(
    pricelistId: string,
    itemId: string,
    body: UpdatePricelistItemRequest,
  ): Observable<PricelistItem> {
    return this.api.patch<PricelistItem>(
      `/api/v1/pricelists/${pricelistId}/items/${itemId}`,
      body,
    );
  }

  removeItem(
    pricelistId: string,
    itemId: string,
  ): Observable<{ pricelistId: string; id: string; removed: boolean }> {
    return this.api.delete(`/api/v1/pricelists/${pricelistId}/items/${itemId}`);
  }
}
