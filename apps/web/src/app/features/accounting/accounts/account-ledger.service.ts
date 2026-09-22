import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import { AccountLedgerQuery, AccountLedgerResponse } from '../models/accounting.models';

@Injectable({ providedIn: 'root' })
export class AccountLedgerService {
  constructor(private readonly api: ApiClient) {}

  get(accountId: string, query: AccountLedgerQuery): Observable<AccountLedgerResponse> {
    return this.api.get<AccountLedgerResponse>(`/v1/accounts/${accountId}/ledger`, query);
  }
}
