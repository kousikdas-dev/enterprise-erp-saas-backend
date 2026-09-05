import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  Account,
  CreateAccountRequest,
  ItemList,
  UpdateAccountRequest,
  UpdateAccountStatusRequest,
} from '../models/accounting.models';

@Injectable({ providedIn: 'root' })
export class AccountService {
  constructor(private readonly api: ApiClient) {}

  list(): Observable<ItemList<Account>> {
    return this.api.get<ItemList<Account>>('/v1/accounts');
  }

  create(body: CreateAccountRequest): Observable<Account> {
    return this.api.post<Account>('/v1/accounts', body);
  }

  update(id: string, body: UpdateAccountRequest): Observable<Account> {
    return this.api.patch<Account>(`/v1/accounts/${id}`, body);
  }

  updateStatus(id: string, body: UpdateAccountStatusRequest): Observable<Account> {
    return this.api.patch<Account>(`/v1/accounts/${id}/status`, body);
  }
}
