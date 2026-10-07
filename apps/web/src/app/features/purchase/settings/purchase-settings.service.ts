import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { CurrentUserService } from '../../../core/auth/current-user.service';
import { DEFAULT_PURCHASE_SETTINGS, PurchaseSettings } from './purchase-settings.model';

const STORAGE_PREFIX = 'erp.purchaseSettings.';

/**
 * No backend settings endpoint exists yet — persists to localStorage, scoped
 * per tenant. get()/update() stay Observable-based so a real `/v1/purchase-settings`
 * API can replace the storage calls below without changing callers.
 */
@Injectable({ providedIn: 'root' })
export class PurchaseSettingsService {
  private readonly currentUser = inject(CurrentUserService);

  get(): Observable<PurchaseSettings> {
    const raw = localStorage.getItem(this.storageKey());
    if (!raw) {
      return of({ ...DEFAULT_PURCHASE_SETTINGS });
    }
    try {
      return of({ ...DEFAULT_PURCHASE_SETTINGS, ...JSON.parse(raw) });
    } catch {
      return of({ ...DEFAULT_PURCHASE_SETTINGS });
    }
  }

  update(settings: PurchaseSettings): Observable<PurchaseSettings> {
    localStorage.setItem(this.storageKey(), JSON.stringify(settings));
    return of(settings);
  }

  private storageKey(): string {
    return `${STORAGE_PREFIX}${this.currentUser.snapshot?.tenantId ?? 'default'}`;
  }
}
