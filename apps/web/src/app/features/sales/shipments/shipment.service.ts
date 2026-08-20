import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import { CreateShipmentRequest, ItemList, Shipment } from '../models/sales.models';

@Injectable({ providedIn: 'root' })
export class ShipmentService {
  constructor(private readonly api: ApiClient) {}

  list(): Observable<ItemList<Shipment>> {
    return this.api.get<ItemList<Shipment>>('/v1/shipments');
  }

  getById(id: string): Observable<Shipment> {
    return this.api.get<Shipment>(`/v1/shipments/${id}`);
  }

  create(body: CreateShipmentRequest): Observable<Shipment> {
    return this.api.post<Shipment>('/v1/shipments', body);
  }

  /** Retries Inventory posting for PENDING_STOCK shipments (Gateway POST /:id/post). */
  post(id: string): Observable<Shipment> {
    return this.api.post<Shipment>(`/v1/shipments/${id}/post`);
  }
}
