import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CreateProductionOrderRequest,
  ProductionOrder,
  ProductionOrderListQuery,
  ProductionOrderListResponse,
  UpdateProductionOrderRequest,
} from '../models/production.models';

@Injectable({ providedIn: 'root' })
export class ProductionOrderService {
  constructor(private readonly api: ApiClient) {}

  list(query: ProductionOrderListQuery = {}): Observable<ProductionOrderListResponse> {
    const params = new URLSearchParams();
    if (query.search) params.set('search', query.search);
    if (query.status) params.set('status', query.status);
    if (query.dateFrom) params.set('dateFrom', query.dateFrom);
    if (query.dateTo) params.set('dateTo', query.dateTo);
    if (query.page) params.set('page', String(query.page));
    if (query.pageSize) params.set('pageSize', String(query.pageSize));
    const qs = params.toString();
    return this.api.get<ProductionOrderListResponse>(
      `/v1/production/production-orders${qs ? `?${qs}` : ''}`,
    );
  }

  getById(id: string): Observable<ProductionOrder> {
    return this.api.get<ProductionOrder>(`/v1/production/production-orders/${id}`);
  }

  create(body: CreateProductionOrderRequest): Observable<ProductionOrder> {
    return this.api.post<ProductionOrder>('/v1/production/production-orders', body);
  }

  update(id: string, body: UpdateProductionOrderRequest): Observable<ProductionOrder> {
    return this.api.patch<ProductionOrder>(
      `/v1/production/production-orders/${id}`,
      body,
    );
  }

  remove(id: string): Observable<{ id: string; removed: boolean }> {
    return this.api.delete<{ id: string; removed: boolean }>(
      `/v1/production/production-orders/${id}`,
    );
  }

  plan(id: string): Observable<ProductionOrder> {
    return this.api.post<ProductionOrder>(
      `/v1/production/production-orders/${id}/plan`,
    );
  }

  release(id: string): Observable<ProductionOrder> {
    return this.api.post<ProductionOrder>(
      `/v1/production/production-orders/${id}/release`,
    );
  }

  start(id: string): Observable<ProductionOrder> {
    return this.api.post<ProductionOrder>(
      `/v1/production/production-orders/${id}/start`,
    );
  }

  complete(id: string): Observable<ProductionOrder> {
    return this.api.post<ProductionOrder>(
      `/v1/production/production-orders/${id}/complete`,
    );
  }

  cancel(id: string): Observable<ProductionOrder> {
    return this.api.post<ProductionOrder>(
      `/v1/production/production-orders/${id}/cancel`,
    );
  }

  close(id: string): Observable<ProductionOrder> {
    return this.api.post<ProductionOrder>(
      `/v1/production/production-orders/${id}/close`,
    );
  }
}
