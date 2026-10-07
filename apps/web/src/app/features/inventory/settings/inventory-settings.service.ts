import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { CurrentUserService } from '../../../core/auth/current-user.service';
import {
  DEFAULT_INVENTORY_SETTINGS,
  InventorySettings,
} from './inventory-settings.model';

const STORAGE_PREFIX = 'erp.inventorySettings.';

/**
 * No backend settings endpoint exists yet — persists to localStorage, scoped
 * per tenant. get()/update() stay Observable-based so a real `/v1/inventory-settings`
 * API can replace the storage calls below without changing callers.
 */
@Injectable({ providedIn: 'root' })
export class InventorySettingsService {
  private readonly currentUser = inject(CurrentUserService);

  get(): Observable<InventorySettings> {
    const raw = localStorage.getItem(this.storageKey());
    if (!raw) {
      return of({ ...DEFAULT_INVENTORY_SETTINGS });
    }
    try {
      return of({ ...DEFAULT_INVENTORY_SETTINGS, ...JSON.parse(raw) });
    } catch {
      return of({ ...DEFAULT_INVENTORY_SETTINGS });
    }
  }

  update(settings: InventorySettings): Observable<InventorySettings> {
    localStorage.setItem(this.storageKey(), JSON.stringify(settings));
    return of(settings);
  }

  private storageKey(): string {
    return `${STORAGE_PREFIX}${this.currentUser.snapshot?.tenantId ?? 'default'}`;
  }
}
