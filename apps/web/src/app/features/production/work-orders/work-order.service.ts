import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CreateWorkOrderRequest,
  UpdateWorkOrderRequest,
  WorkOrder,
  WorkOrderListQuery,
  WorkOrderListResponse,
} from '../models/production.models';

@Injectable({ providedIn: 'root' })
export class WorkOrderService {
  constructor(private readonly api: ApiClient) {}

  list(query: WorkOrderListQuery = {}): Observable<WorkOrderListResponse> {
    const params = new URLSearchParams();
    if (query.productionOrderId) params.set('productionOrderId', query.productionOrderId);
    if (query.workCentreId) params.set('workCentreId', query.workCentreId);
    if (query.status) params.set('status', query.status);
    if (query.search) params.set('search', query.search);
    if (query.page) params.set('page', String(query.page));
    if (query.pageSize) params.set('pageSize', String(query.pageSize));
    const qs = params.toString();
    return this.api.get<WorkOrderListResponse>(
      `/v1/production/work-orders${qs ? `?${qs}` : ''}`,
    );
  }

  getById(id: string): Observable<WorkOrder> {
    return this.api.get<WorkOrder>(`/v1/production/work-orders/${id}`);
  }

  create(body: CreateWorkOrderRequest): Observable<WorkOrder> {
    return this.api.post<WorkOrder>('/v1/production/work-orders', body);
  }

  update(id: string, body: UpdateWorkOrderRequest): Observable<WorkOrder> {
    return this.api.patch<WorkOrder>(`/v1/production/work-orders/${id}`, body);
  }

  remove(id: string): Observable<{ id: string; removed: boolean }> {
    return this.api.delete<{ id: string; removed: boolean }>(
      `/v1/production/work-orders/${id}`,
    );
  }

  start(id: string): Observable<WorkOrder> {
    return this.api.post<WorkOrder>(`/v1/production/work-orders/${id}/start`);
  }

  block(id: string): Observable<WorkOrder> {
    return this.api.post<WorkOrder>(`/v1/production/work-orders/${id}/block`);
  }

  unblock(id: string): Observable<WorkOrder> {
    return this.api.post<WorkOrder>(`/v1/production/work-orders/${id}/unblock`);
  }

  complete(id: string): Observable<WorkOrder> {
    return this.api.post<WorkOrder>(`/v1/production/work-orders/${id}/complete`);
  }

  cancel(id: string): Observable<WorkOrder> {
    return this.api.post<WorkOrder>(`/v1/production/work-orders/${id}/cancel`);
  }
}
