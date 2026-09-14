import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CreateSupplierAddressRequest,
  CreateSupplierRequest,
  ItemList,
  Supplier,
  SupplierAddress,
  UpdateSupplierAddressRequest,
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

  listAddresses(supplierId: string): Observable<ItemList<SupplierAddress>> {
    return this.api.get<ItemList<SupplierAddress>>(
      `/v1/suppliers/${supplierId}/addresses`,
    );
  }

  createAddress(
    supplierId: string,
    body: CreateSupplierAddressRequest,
  ): Observable<SupplierAddress> {
    return this.api.post<SupplierAddress>(
      `/v1/suppliers/${supplierId}/addresses`,
      body,
    );
  }

  updateAddress(
    supplierId: string,
    addressId: string,
    body: UpdateSupplierAddressRequest,
  ): Observable<SupplierAddress> {
    return this.api.patch<SupplierAddress>(
      `/v1/suppliers/${supplierId}/addresses/${addressId}`,
      body,
    );
  }

  deleteAddress(
    supplierId: string,
    addressId: string,
  ): Observable<{ success: boolean; id: string }> {
    return this.api.delete<{ success: boolean; id: string }>(
      `/v1/suppliers/${supplierId}/addresses/${addressId}`,
    );
  }
}
