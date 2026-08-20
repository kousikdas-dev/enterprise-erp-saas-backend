import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CreatePurchaseOrderRequest,
  ItemList,
  PurchaseOrder,
  UpdatePurchaseOrderRequest,
} from '../models/purchase.models';

@Injectable({ providedIn: 'root' })
export class PurchaseOrderService {
  constructor(private readonly api: ApiClient) {}

  list(): Observable<ItemList<PurchaseOrder>> {
    return this.api.get<ItemList<PurchaseOrder>>('/v1/purchase-orders');
  }

  getById(id: string): Observable<PurchaseOrder> {
    return this.api.get<PurchaseOrder>(`/v1/purchase-orders/${id}`);
  }

  create(body: CreatePurchaseOrderRequest): Observable<PurchaseOrder> {
    return this.api.post<PurchaseOrder>('/v1/purchase-orders', body);
  }

  update(id: string, body: UpdatePurchaseOrderRequest): Observable<PurchaseOrder> {
    return this.api.patch<PurchaseOrder>(`/v1/purchase-orders/${id}`, body);
  }

  confirm(id: string): Observable<PurchaseOrder> {
    return this.api.post<PurchaseOrder>(`/v1/purchase-orders/${id}/confirm`);
  }

  cancel(id: string): Observable<PurchaseOrder> {
    return this.api.post<PurchaseOrder>(`/v1/purchase-orders/${id}/cancel`);
  }
}
