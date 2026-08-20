import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CreateRoleRequest,
  ItemList,
  Role,
  RoleRemoved,
  UpdateRoleRequest,
} from '../models/administration.models';

@Injectable({ providedIn: 'root' })
export class RoleService {
  constructor(private readonly api: ApiClient) {}

  list(): Observable<ItemList<Role>> {
    return this.api.get<ItemList<Role>>('/v1/roles');
  }

  getById(id: string): Observable<Role> {
    return this.api.get<Role>(`/v1/roles/${id}`);
  }

  create(body: CreateRoleRequest): Observable<Role> {
    return this.api.post<Role>('/v1/roles', body);
  }

  update(id: string, body: UpdateRoleRequest): Observable<Role> {
    return this.api.patch<Role>(`/v1/roles/${id}`, body);
  }

  assignPermission(id: string, permissionId: string): Observable<Role> {
    return this.api.post<Role>(`/v1/roles/${id}/permissions`, { permissionId });
  }

  removePermission(id: string, permissionId: string): Observable<RoleRemoved> {
    return this.api.delete<RoleRemoved>(`/v1/roles/${id}/permissions/${permissionId}`);
  }
}
