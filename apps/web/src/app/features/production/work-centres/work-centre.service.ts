import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CreateWorkCentreRequest,
  ItemList,
  UpdateWorkCentreRequest,
  WorkCentre,
} from '../models/production.models';

@Injectable({ providedIn: 'root' })
export class WorkCentreService {
  constructor(private readonly api: ApiClient) {}

  list(): Observable<ItemList<WorkCentre>> {
    return this.api.get<ItemList<WorkCentre>>('/v1/production/work-centres');
  }

  getById(id: string): Observable<WorkCentre> {
    return this.api.get<WorkCentre>(`/v1/production/work-centres/${id}`);
  }

  create(body: CreateWorkCentreRequest): Observable<WorkCentre> {
    return this.api.post<WorkCentre>('/v1/production/work-centres', body);
  }

  update(id: string, body: UpdateWorkCentreRequest): Observable<WorkCentre> {
    return this.api.patch<WorkCentre>(
      `/v1/production/work-centres/${id}`,
      body,
    );
  }

  remove(id: string): Observable<{ id: string; removed: boolean }> {
    return this.api.delete<{ id: string; removed: boolean }>(
      `/v1/production/work-centres/${id}`,
    );
  }

  activate(id: string): Observable<WorkCentre> {
    return this.api.post<WorkCentre>(
      `/v1/production/work-centres/${id}/activate`,
    );
  }

  deactivate(id: string): Observable<WorkCentre> {
    return this.api.post<WorkCentre>(
      `/v1/production/work-centres/${id}/deactivate`,
    );
  }
}
