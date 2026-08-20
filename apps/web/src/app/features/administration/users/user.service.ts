import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CreateUserRequest,
  ItemList,
  UpdateUserRequest,
  UpdateUserStatusRequest,
  User,
  UserRole,
  UserRoleRemoved,
} from '../models/administration.models';

@Injectable({ providedIn: 'root' })
export class UserService {
  constructor(private readonly api: ApiClient) {}

  list(): Observable<ItemList<User>> {
    return this.api.get<ItemList<User>>('/v1/users');
  }

  getById(id: string): Observable<User> {
    return this.api.get<User>(`/v1/users/${id}`);
  }

  create(body: CreateUserRequest): Observable<User> {
    return this.api.post<User>('/v1/users', body);
  }

  update(id: string, body: UpdateUserRequest): Observable<User> {
    return this.api.patch<User>(`/v1/users/${id}`, body);
  }

  updateStatus(id: string, body: UpdateUserStatusRequest): Observable<User> {
    return this.api.patch<User>(`/v1/users/${id}/status`, body);
  }

  assignRole(id: string, roleId: string): Observable<UserRole> {
    return this.api.post<UserRole>(`/v1/users/${id}/roles`, { roleId });
  }

  removeRole(id: string, roleId: string): Observable<UserRoleRemoved> {
    return this.api.delete<UserRoleRemoved>(`/v1/users/${id}/roles/${roleId}`);
  }
}
