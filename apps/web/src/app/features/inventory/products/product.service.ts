import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CreateProductRequest,
  ItemList,
  Product,
  UpdateProductRequest,
} from '../models/inventory.models';

@Injectable({ providedIn: 'root' })
export class ProductService {
  constructor(private readonly api: ApiClient) {}

  list(): Observable<ItemList<Product>> {
    return this.api.get<ItemList<Product>>('/v1/products');
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
}
