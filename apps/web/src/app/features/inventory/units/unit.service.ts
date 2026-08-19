import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CreateUnitRequest,
  ItemList,
  Unit,
  UpdateUnitRequest,
} from '../models/inventory.models';

@Injectable({ providedIn: 'root' })
export class UnitService {
  constructor(private readonly api: ApiClient) {}

  list(): Observable<ItemList<Unit>> {
    return this.api.get<ItemList<Unit>>('/v1/units');
  }

  getById(id: string): Observable<Unit> {
    return this.api.get<Unit>(`/v1/units/${id}`);
  }

  create(body: CreateUnitRequest): Observable<Unit> {
    return this.api.post<Unit>('/v1/units', body);
  }

  update(id: string, body: UpdateUnitRequest): Observable<Unit> {
    return this.api.patch<Unit>(`/v1/units/${id}`, body);
  }
}
