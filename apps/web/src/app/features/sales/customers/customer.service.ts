import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CreateCustomerRequest,
  Customer,
  ItemList,
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
}
