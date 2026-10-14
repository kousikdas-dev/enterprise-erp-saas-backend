import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CreateRoutingRequest,
  ItemList,
  Routing,
  UpdateRoutingRequest,
} from '../models/production.models';

@Injectable({ providedIn: 'root' })
export class RoutingService {
  constructor(private readonly api: ApiClient) {}

  list(productId?: string): Observable<ItemList<Routing>> {
    const query = productId ? `?productId=${encodeURIComponent(productId)}` : '';
    return this.api.get<ItemList<Routing>>(`/v1/production/routings${query}`);
  }

  getById(id: string): Observable<Routing> {
    return this.api.get<Routing>(`/v1/production/routings/${id}`);
  }

  create(body: CreateRoutingRequest): Observable<Routing> {
    return this.api.post<Routing>('/v1/production/routings', body);
  }

  update(id: string, body: UpdateRoutingRequest): Observable<Routing> {
    return this.api.patch<Routing>(`/v1/production/routings/${id}`, body);
  }

  remove(id: string): Observable<{ id: string; removed: boolean }> {
    return this.api.delete<{ id: string; removed: boolean }>(
      `/v1/production/routings/${id}`,
    );
  }

  activate(id: string): Observable<Routing> {
    return this.api.post<Routing>(`/v1/production/routings/${id}/activate`);
  }

  deactivate(id: string): Observable<Routing> {
    return this.api.post<Routing>(`/v1/production/routings/${id}/deactivate`);
  }

  newVersion(id: string): Observable<Routing> {
    return this.api.post<Routing>(`/v1/production/routings/${id}/new-version`);
  }
}
