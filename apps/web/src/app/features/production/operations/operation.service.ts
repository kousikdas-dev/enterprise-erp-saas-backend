import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CreateOperationRequest,
  ItemList,
  Operation,
  UpdateOperationRequest,
} from '../models/production.models';

@Injectable({ providedIn: 'root' })
export class OperationService {
  constructor(private readonly api: ApiClient) {}

  list(): Observable<ItemList<Operation>> {
    return this.api.get<ItemList<Operation>>('/v1/production/operations');
  }

  getById(id: string): Observable<Operation> {
    return this.api.get<Operation>(`/v1/production/operations/${id}`);
  }

  create(body: CreateOperationRequest): Observable<Operation> {
    return this.api.post<Operation>('/v1/production/operations', body);
  }

  update(id: string, body: UpdateOperationRequest): Observable<Operation> {
    return this.api.patch<Operation>(`/v1/production/operations/${id}`, body);
  }

  remove(id: string): Observable<{ id: string; removed: boolean }> {
    return this.api.delete<{ id: string; removed: boolean }>(
      `/v1/production/operations/${id}`,
    );
  }

  activate(id: string): Observable<Operation> {
    return this.api.post<Operation>(`/v1/production/operations/${id}/activate`);
  }

  deactivate(id: string): Observable<Operation> {
    return this.api.post<Operation>(
      `/v1/production/operations/${id}/deactivate`,
    );
  }
}
