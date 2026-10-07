import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { CurrentUserService } from '../../../core/auth/current-user.service';
import {
  AccountingSettings,
  DEFAULT_ACCOUNTING_SETTINGS,
} from './accounting-settings.model';

const STORAGE_PREFIX = 'erp.accountingSettings.';

/**
 * No backend settings endpoint exists yet — persists to localStorage, scoped
 * per tenant. get()/update() stay Observable-based so a real `/v1/accounting-settings`
 * API can replace the storage calls below without changing callers.
 */
@Injectable({ providedIn: 'root' })
export class AccountingSettingsService {
  private readonly currentUser = inject(CurrentUserService);

  get(): Observable<AccountingSettings> {
    const raw = localStorage.getItem(this.storageKey());
    if (!raw) {
      return of({ ...DEFAULT_ACCOUNTING_SETTINGS });
    }
    try {
      return of({ ...DEFAULT_ACCOUNTING_SETTINGS, ...JSON.parse(raw) });
    } catch {
      return of({ ...DEFAULT_ACCOUNTING_SETTINGS });
    }
  }

  update(settings: AccountingSettings): Observable<AccountingSettings> {
    localStorage.setItem(this.storageKey(), JSON.stringify(settings));
    return of(settings);
  }

  private storageKey(): string {
    return `${STORAGE_PREFIX}${this.currentUser.snapshot?.tenantId ?? 'default'}`;
  }
}
