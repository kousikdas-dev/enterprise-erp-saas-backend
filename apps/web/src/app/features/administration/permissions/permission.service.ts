import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import { ItemList, Permission } from '../models/administration.models';

/**
 * Named PermissionCatalogService (not PermissionService) to avoid colliding
 * with core/permissions/permission.service.ts, the app-wide permission-check
 * service used for AppPermissions gating.
 */
@Injectable({ providedIn: 'root' })
export class PermissionCatalogService {
  constructor(private readonly api: ApiClient) {}

  list(): Observable<ItemList<Permission>> {
    return this.api.get<ItemList<Permission>>('/v1/permissions');
  }

  getById(id: string): Observable<Permission> {
    return this.api.get<Permission>(`/v1/permissions/${id}`);
  }
}
