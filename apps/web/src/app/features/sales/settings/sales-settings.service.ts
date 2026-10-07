import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { CurrentUserService } from '../../../core/auth/current-user.service';
import { DEFAULT_SALES_SETTINGS, SalesSettings } from './sales-settings.model';

const STORAGE_PREFIX = 'erp.salesSettings.';

/**
 * No backend settings endpoint exists yet — persists to localStorage, scoped
 * per tenant. get()/update() stay Observable-based so a real `/v1/sales-settings`
 * API can replace the storage calls below without changing callers.
 */
@Injectable({ providedIn: 'root' })
export class SalesSettingsService {
  private readonly currentUser = inject(CurrentUserService);

  get(): Observable<SalesSettings> {
    const raw = localStorage.getItem(this.storageKey());
    if (!raw) {
      return of({ ...DEFAULT_SALES_SETTINGS });
    }
    try {
      return of({ ...DEFAULT_SALES_SETTINGS, ...JSON.parse(raw) });
    } catch {
      return of({ ...DEFAULT_SALES_SETTINGS });
    }
  }

  update(settings: SalesSettings): Observable<SalesSettings> {
    localStorage.setItem(this.storageKey(), JSON.stringify(settings));
    return of(settings);
  }

  private storageKey(): string {
    return `${STORAGE_PREFIX}${this.currentUser.snapshot?.tenantId ?? 'default'}`;
  }
}
