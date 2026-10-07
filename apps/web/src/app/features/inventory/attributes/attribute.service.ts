import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  Attribute,
  AttributeValue,
  CreateAttributeRequest,
  CreateAttributeValueRequest,
  ItemList,
  UpdateAttributeRequest,
  UpdateAttributeValueRequest,
} from '../models/inventory.models';

/** Not in the gateway's globalPrefixExcludes list, so (unlike Units/Categories) this keeps the 'api' prefix. */
@Injectable({ providedIn: 'root' })
export class AttributeService {
  constructor(private readonly api: ApiClient) {}

  list(): Observable<ItemList<Attribute>> {
    return this.api.get<ItemList<Attribute>>('/api/v1/attributes');
  }

  getById(id: string): Observable<Attribute> {
    return this.api.get<Attribute>(`/api/v1/attributes/${id}`);
  }

  create(body: CreateAttributeRequest): Observable<Attribute> {
    return this.api.post<Attribute>('/api/v1/attributes', body);
  }

  update(id: string, body: UpdateAttributeRequest): Observable<Attribute> {
    return this.api.patch<Attribute>(`/api/v1/attributes/${id}`, body);
  }

  addValue(
    attributeId: string,
    body: CreateAttributeValueRequest,
  ): Observable<AttributeValue> {
    return this.api.post<AttributeValue>(
      `/api/v1/attributes/${attributeId}/values`,
      body,
    );
  }

  updateValue(
    attributeId: string,
    valueId: string,
    body: UpdateAttributeValueRequest,
  ): Observable<AttributeValue> {
    return this.api.patch<AttributeValue>(
      `/api/v1/attributes/${attributeId}/values/${valueId}`,
      body,
    );
  }

  removeValue(
    attributeId: string,
    valueId: string,
  ): Observable<{ attributeId: string; id: string; removed: boolean }> {
    return this.api.delete(`/api/v1/attributes/${attributeId}/values/${valueId}`);
  }
}
