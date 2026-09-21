import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  AccountMapping,
  AccountMappingList,
  CreateAccountMappingRequest,
  UpdateAccountMappingRequest,
} from '../models/accounting.models';

@Injectable({ providedIn: 'root' })
export class AccountMappingService {
  constructor(private readonly api: ApiClient) {}

  list(): Observable<AccountMappingList> {
    return this.api.get<AccountMappingList>('/v1/account-mappings');
  }

  create(body: CreateAccountMappingRequest): Observable<AccountMapping> {
    return this.api.post<AccountMapping>('/v1/account-mappings', body);
  }

  update(
    id: string,
    body: UpdateAccountMappingRequest,
  ): Observable<AccountMapping> {
    return this.api.patch<AccountMapping>(`/v1/account-mappings/${id}`, body);
  }

  remove(id: string): Observable<{ success: boolean; id: string }> {
    return this.api.delete<{ success: boolean; id: string }>(
      `/v1/account-mappings/${id}`,
    );
  }
}
