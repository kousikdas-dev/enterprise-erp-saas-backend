import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CreateUnspscCategoryRequest,
  ItemList,
  UnspscCategory,
  UpdateUnspscCategoryRequest,
} from '../models/inventory.models';

/** Not in the gateway's globalPrefixExcludes list, so (unlike Units/Categories) this keeps the 'api' prefix. */
@Injectable({ providedIn: 'root' })
export class UnspscCategoryService {
  constructor(private readonly api: ApiClient) {}

  list(): Observable<ItemList<UnspscCategory>> {
    return this.api.get<ItemList<UnspscCategory>>('/api/v1/unspsc-categories');
  }

  getById(id: string): Observable<UnspscCategory> {
    return this.api.get<UnspscCategory>(`/api/v1/unspsc-categories/${id}`);
  }

  create(body: CreateUnspscCategoryRequest): Observable<UnspscCategory> {
    return this.api.post<UnspscCategory>('/api/v1/unspsc-categories', body);
  }

  update(
    id: string,
    body: UpdateUnspscCategoryRequest,
  ): Observable<UnspscCategory> {
    return this.api.patch<UnspscCategory>(
      `/api/v1/unspsc-categories/${id}`,
      body,
    );
  }
}
