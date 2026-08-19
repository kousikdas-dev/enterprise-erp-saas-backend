import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';

/** Scaffold only — CRUD screens arrive in a later frontend phase. */
@Injectable({ providedIn: 'root' })
export class ProformaInvoiceService {
  constructor(private readonly api: ApiClient) {}

  list(): Observable<{ items: unknown[] }> {
    return this.api.get<{ items: unknown[] }>('/v1/proforma-invoices');
  }
}
