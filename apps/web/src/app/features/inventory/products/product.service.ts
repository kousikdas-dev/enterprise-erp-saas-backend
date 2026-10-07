import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CreateProductRequest,
  CreateProductUnitRequest,
  ItemList,
  Product,
  ProductUnit,
  RemoveProductUnitResult,
  UpdateProductRequest,
  UpdateProductUnitRequest,
} from '../models/inventory.models';

@Injectable({ providedIn: 'root' })
export class ProductService {
  constructor(private readonly api: ApiClient) {}

  list(templateProductId?: string): Observable<ItemList<Product>> {
    const query = templateProductId
      ? `?templateProductId=${encodeURIComponent(templateProductId)}`
      : '';
    return this.api.get<ItemList<Product>>(`/v1/products${query}`);
  }

  getById(id: string): Observable<Product> {
    return this.api.get<Product>(`/v1/products/${id}`);
  }

  create(body: CreateProductRequest): Observable<Product> {
    return this.api.post<Product>('/v1/products', body);
  }

  update(id: string, body: UpdateProductRequest): Observable<Product> {
    return this.api.patch<Product>(`/v1/products/${id}`, body);
  }

  listUnits(productId: string): Observable<ItemList<ProductUnit>> {
    return this.api.get<ItemList<ProductUnit>>(
      `/v1/products/${productId}/units`,
    );
  }

  createUnit(
    productId: string,
    body: CreateProductUnitRequest,
  ): Observable<ProductUnit> {
    return this.api.post<ProductUnit>(
      `/v1/products/${productId}/units`,
      body,
    );
  }

  updateUnit(
    productId: string,
    unitId: string,
    body: UpdateProductUnitRequest,
  ): Observable<ProductUnit> {
    return this.api.patch<ProductUnit>(
      `/v1/products/${productId}/units/${unitId}`,
      body,
    );
  }

  deleteUnit(
    productId: string,
    unitId: string,
  ): Observable<RemoveProductUnitResult> {
    return this.api.delete<RemoveProductUnitResult>(
      `/v1/products/${productId}/units/${unitId}`,
    );
  }
}
