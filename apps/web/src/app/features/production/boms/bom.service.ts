import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  Bom,
  CreateBomRequest,
  ItemList,
  UpdateBomRequest,
} from '../models/production.models';

@Injectable({ providedIn: 'root' })
export class BomService {
  constructor(private readonly api: ApiClient) {}

  list(parentProductId?: string): Observable<ItemList<Bom>> {
    const query = parentProductId
      ? `?parentProductId=${encodeURIComponent(parentProductId)}`
      : '';
    return this.api.get<ItemList<Bom>>(`/v1/production/boms${query}`);
  }

  getById(id: string): Observable<Bom> {
    return this.api.get<Bom>(`/v1/production/boms/${id}`);
  }

  create(body: CreateBomRequest): Observable<Bom> {
    return this.api.post<Bom>('/v1/production/boms', body);
  }

  update(id: string, body: UpdateBomRequest): Observable<Bom> {
    return this.api.patch<Bom>(`/v1/production/boms/${id}`, body);
  }

  remove(id: string): Observable<{ id: string; removed: boolean }> {
    return this.api.delete<{ id: string; removed: boolean }>(
      `/v1/production/boms/${id}`,
    );
  }

  activate(id: string): Observable<Bom> {
    return this.api.post<Bom>(`/v1/production/boms/${id}/activate`);
  }

  deactivate(id: string): Observable<Bom> {
    return this.api.post<Bom>(`/v1/production/boms/${id}/deactivate`);
  }

  newVersion(id: string): Observable<Bom> {
    return this.api.post<Bom>(`/v1/production/boms/${id}/new-version`);
  }
}
