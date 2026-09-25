import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  ApAgingResult,
  ApReconciliationSummary,
  ItemList,
  SupplierApLedgerItem,
  SupplierApStatement,
  SupplierApSummary,
} from '../models/purchase.models';

export interface ApInvoiceListQuery {
  supplierId?: string;
  status?: string;
  paymentStatus?: string;
  includePayments?: boolean;
}

export interface ApAgingQuery {
  supplierId?: string;
  asOfDate?: string;
}

export interface ApStatementQuery {
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class AccountsPayableService {
  constructor(private readonly api: ApiClient) {}

  listSuppliers(onlyOutstanding = true): Observable<ItemList<SupplierApSummary>> {
    return this.api.get<ItemList<SupplierApSummary>>('/api/v1/accounts-payable/suppliers', {
      onlyOutstanding,
    });
  }

  getSupplier(supplierId: string): Observable<SupplierApSummary> {
    return this.api.get<SupplierApSummary>(`/api/v1/accounts-payable/suppliers/${supplierId}`);
  }

  listInvoices(query: ApInvoiceListQuery = {}): Observable<ItemList<SupplierApLedgerItem>> {
    return this.api.get<ItemList<SupplierApLedgerItem>>('/api/v1/accounts-payable/invoices', {
      ...query,
    });
  }

  getStatement(supplierId: string, query: ApStatementQuery = {}): Observable<SupplierApStatement> {
    return this.api.get<SupplierApStatement>(
      `/api/v1/accounts-payable/suppliers/${supplierId}/statement`,
      { ...query },
    );
  }

  getAging(query: ApAgingQuery = {}): Observable<ApAgingResult> {
    return this.api.get<ApAgingResult>('/api/v1/accounts-payable/aging', { ...query });
  }

  getReconciliation(): Observable<ApReconciliationSummary> {
    return this.api.get<ApReconciliationSummary>('/api/v1/accounts-payable/reconciliation');
  }
}
