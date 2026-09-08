import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CreateTaxCodeRequest,
  TaxCode,
  TaxCodeList,
  UpdateTaxCodeRequest,
  UpdateTaxCodeStatusRequest,
} from '../models/accounting.models';

@Injectable({ providedIn: 'root' })
export class TaxCodeService {
  constructor(private readonly api: ApiClient) {}

  list(): Observable<TaxCodeList> {
    return this.api.get<TaxCodeList>('/v1/tax-codes');
  }

  getById(id: string): Observable<TaxCode> {
    return this.api.get<TaxCode>(`/v1/tax-codes/${id}`);
  }

  create(body: CreateTaxCodeRequest): Observable<TaxCode> {
    return this.api.post<TaxCode>('/v1/tax-codes', body);
  }

  update(id: string, body: UpdateTaxCodeRequest): Observable<TaxCode> {
    return this.api.patch<TaxCode>(`/v1/tax-codes/${id}`, body);
  }

  updateStatus(id: string, body: UpdateTaxCodeStatusRequest): Observable<TaxCode> {
    return this.api.patch<TaxCode>(`/v1/tax-codes/${id}/status`, body);
  }
}
