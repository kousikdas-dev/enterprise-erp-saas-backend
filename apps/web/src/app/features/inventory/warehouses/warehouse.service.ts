import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CreateWarehouseRequest,
  ItemList,
  UpdateWarehouseRequest,
  Warehouse,
} from '../models/inventory.models';

@Injectable({ providedIn: 'root' })
export class WarehouseService {
  constructor(private readonly api: ApiClient) {}

  list(): Observable<ItemList<Warehouse>> {
    return this.api.get<ItemList<Warehouse>>('/v1/warehouses');
  }

  getById(id: string): Observable<Warehouse> {
    return this.api.get<Warehouse>(`/v1/warehouses/${id}`);
  }

  create(body: CreateWarehouseRequest): Observable<Warehouse> {
    return this.api.post<Warehouse>('/v1/warehouses', body);
  }

  update(id: string, body: UpdateWarehouseRequest): Observable<Warehouse> {
    return this.api.patch<Warehouse>(`/v1/warehouses/${id}`, body);
  }
}
