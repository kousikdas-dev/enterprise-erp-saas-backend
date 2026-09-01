import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CreateCustomerAddressRequest,
  CreateCustomerRequest,
  Customer,
  CustomerAddress,
  ItemList,
  UpdateCustomerAddressRequest,
  UpdateCustomerRequest,
} from '../models/sales.models';

@Injectable({ providedIn: 'root' })
export class CustomerService {
  constructor(private readonly api: ApiClient) {}

  list(): Observable<ItemList<Customer>> {
    return this.api.get<ItemList<Customer>>('/v1/customers');
  }

  getById(id: string): Observable<Customer> {
    return this.api.get<Customer>(`/v1/customers/${id}`);
  }

  create(body: CreateCustomerRequest): Observable<Customer> {
    return this.api.post<Customer>('/v1/customers', body);
  }

  update(id: string, body: UpdateCustomerRequest): Observable<Customer> {
    return this.api.patch<Customer>(`/v1/customers/${id}`, body);
  }

  listAddresses(customerId: string): Observable<ItemList<CustomerAddress>> {
    return this.api.get<ItemList<CustomerAddress>>(
      `/v1/customers/${customerId}/addresses`,
    );
  }

  createAddress(
    customerId: string,
    body: CreateCustomerAddressRequest,
  ): Observable<CustomerAddress> {
    return this.api.post<CustomerAddress>(
      `/v1/customers/${customerId}/addresses`,
      body,
    );
  }

  updateAddress(
    customerId: string,
    addressId: string,
    body: UpdateCustomerAddressRequest,
  ): Observable<CustomerAddress> {
    return this.api.patch<CustomerAddress>(
      `/v1/customers/${customerId}/addresses/${addressId}`,
      body,
    );
  }

  deleteAddress(
    customerId: string,
    addressId: string,
  ): Observable<{ success: boolean; id: string }> {
    return this.api.delete<{ success: boolean; id: string }>(
      `/v1/customers/${customerId}/addresses/${addressId}`,
    );
  }
}
