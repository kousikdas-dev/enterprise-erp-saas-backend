import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CreateDeliveryMethodRequest,
  DeliveryMethod,
  ItemList,
  UpdateDeliveryMethodRequest,
} from '../models/sales.models';

/** Not in the gateway's globalPrefixExcludes list, so (unlike Customers/Quotations) this keeps the 'api' prefix. */
@Injectable({ providedIn: 'root' })
export class DeliveryMethodService {
  constructor(private readonly api: ApiClient) {}

  list(): Observable<ItemList<DeliveryMethod>> {
    return this.api.get<ItemList<DeliveryMethod>>('/api/v1/delivery-methods');
  }

  getById(id: string): Observable<DeliveryMethod> {
    return this.api.get<DeliveryMethod>(`/api/v1/delivery-methods/${id}`);
  }

  create(body: CreateDeliveryMethodRequest): Observable<DeliveryMethod> {
    return this.api.post<DeliveryMethod>('/api/v1/delivery-methods', body);
  }

  update(
    id: string,
    body: UpdateDeliveryMethodRequest,
  ): Observable<DeliveryMethod> {
    return this.api.patch<DeliveryMethod>(
      `/api/v1/delivery-methods/${id}`,
      body,
    );
  }
}
