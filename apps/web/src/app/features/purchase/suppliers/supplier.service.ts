import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CreateSupplierRequest,
  ItemList,
  Supplier,
  UpdateSupplierRequest,
} from '../models/purchase.models';

@Injectable({ providedIn: 'root' })
export class SupplierService {
  constructor(private readonly api: ApiClient) {}

  list(): Observable<ItemList<Supplier>> {
    return this.api.get<ItemList<Supplier>>('/v1/suppliers');
  }

  getById(id: string): Observable<Supplier> {
    return this.api.get<Supplier>(`/v1/suppliers/${id}`);
  }

  create(body: CreateSupplierRequest): Observable<Supplier> {
    return this.api.post<Supplier>('/v1/suppliers', body);
  }

  update(id: string, body: UpdateSupplierRequest): Observable<Supplier> {
    return this.api.patch<Supplier>(`/v1/suppliers/${id}`, body);
  }
}
