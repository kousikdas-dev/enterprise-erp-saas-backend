import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CreateUnbuildOrderRequest,
  UnbuildOrder,
  UnbuildOrderListQuery,
  UnbuildOrderListResponse,
  UpdateUnbuildOrderRequest,
} from '../models/production.models';

@Injectable({ providedIn: 'root' })
export class UnbuildOrderService {
  constructor(private readonly api: ApiClient) {}

  list(query: UnbuildOrderListQuery = {}): Observable<UnbuildOrderListResponse> {
    const params = new URLSearchParams();
    if (query.status) params.set('status', query.status);
    if (query.search) params.set('search', query.search);
    if (query.page) params.set('page', String(query.page));
    if (query.pageSize) params.set('pageSize', String(query.pageSize));
    const qs = params.toString();
    return this.api.get<UnbuildOrderListResponse>(
      `/v1/production/unbuild-orders${qs ? `?${qs}` : ''}`,
    );
  }

  getById(id: string): Observable<UnbuildOrder> {
    return this.api.get<UnbuildOrder>(`/v1/production/unbuild-orders/${id}`);
  }

  create(body: CreateUnbuildOrderRequest): Observable<UnbuildOrder> {
    return this.api.post<UnbuildOrder>('/v1/production/unbuild-orders', body);
  }

  update(id: string, body: UpdateUnbuildOrderRequest): Observable<UnbuildOrder> {
    return this.api.patch<UnbuildOrder>(`/v1/production/unbuild-orders/${id}`, body);
  }

  complete(id: string): Observable<UnbuildOrder> {
    return this.api.post<UnbuildOrder>(`/v1/production/unbuild-orders/${id}/complete`);
  }

  cancel(id: string): Observable<UnbuildOrder> {
    return this.api.post<UnbuildOrder>(`/v1/production/unbuild-orders/${id}/cancel`);
  }
}
