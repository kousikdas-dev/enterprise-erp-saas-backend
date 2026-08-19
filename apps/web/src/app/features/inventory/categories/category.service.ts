import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  Category,
  CreateCategoryRequest,
  ItemList,
  UpdateCategoryRequest,
} from '../models/inventory.models';

@Injectable({ providedIn: 'root' })
export class CategoryService {
  constructor(private readonly api: ApiClient) {}

  list(): Observable<ItemList<Category>> {
    return this.api.get<ItemList<Category>>('/v1/categories');
  }

  getById(id: string): Observable<Category> {
    return this.api.get<Category>(`/v1/categories/${id}`);
  }

  create(body: CreateCategoryRequest): Observable<Category> {
    return this.api.post<Category>('/v1/categories', body);
  }

  update(id: string, body: UpdateCategoryRequest): Observable<Category> {
    return this.api.patch<Category>(`/v1/categories/${id}`, body);
  }
}
