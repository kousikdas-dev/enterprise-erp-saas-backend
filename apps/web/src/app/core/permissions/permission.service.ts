import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AppPermission } from './permissions.constants';

/**
 * Frontend permission helper.
 *
 * Enforcement is intentionally disabled until the Gateway exposes the
 * current user's permissions on a public endpoint. Soft checks return true.
 */
@Injectable({ providedIn: 'root' })
export class PermissionService {
  /**
   * When false, has()/hasAny()/hasAll() return true (UI not hidden).
   * Flip to true only after a public permission source is wired.
   */
  readonly enforcementEnabled = false;

  private readonly permissionsSubject = new BehaviorSubject<readonly string[]>(
    [],
  );
  readonly permissions$ = this.permissionsSubject.asObservable();

  setPermissions(permissions: readonly string[]): void {
    this.permissionsSubject.next([...permissions]);
  }

  clear(): void {
    this.permissionsSubject.next([]);
  }

  has(permission: AppPermission | string): boolean {
    if (!this.enforcementEnabled) {
      return true;
    }
    return this.permissionsSubject.value.includes(permission);
  }

  hasAny(...permissions: Array<AppPermission | string>): boolean {
    if (!this.enforcementEnabled) {
      return true;
    }
    return permissions.some((permission) => this.has(permission));
  }

  hasAll(...permissions: Array<AppPermission | string>): boolean {
    if (!this.enforcementEnabled) {
      return true;
    }
    return permissions.every((permission) => this.has(permission));
  }
}
