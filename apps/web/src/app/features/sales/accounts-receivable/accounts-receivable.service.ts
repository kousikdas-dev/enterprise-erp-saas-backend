import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  ArAgingResult,
  ArReconciliationSummary,
  CustomerArLedgerItem,
  CustomerArStatement,
  CustomerArSummary,
  ItemList,
} from '../models/sales.models';

export interface ArInvoiceListQuery {
  customerId?: string;
  status?: string;
  paymentStatus?: string;
  includePayments?: boolean;
}

export interface ArAgingQuery {
  customerId?: string;
  asOfDate?: string;
}

export interface ArStatementQuery {
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class AccountsReceivableService {
  constructor(private readonly api: ApiClient) {}

  listCustomers(onlyOutstanding = true): Observable<ItemList<CustomerArSummary>> {
    return this.api.get<ItemList<CustomerArSummary>>('/api/v1/accounts-receivable/customers', {
      onlyOutstanding,
    });
  }

  getCustomer(customerId: string): Observable<CustomerArSummary> {
    return this.api.get<CustomerArSummary>(`/api/v1/accounts-receivable/customers/${customerId}`);
  }

  listInvoices(query: ArInvoiceListQuery = {}): Observable<ItemList<CustomerArLedgerItem>> {
    return this.api.get<ItemList<CustomerArLedgerItem>>('/api/v1/accounts-receivable/invoices', {
      ...query,
    });
  }

  getStatement(customerId: string, query: ArStatementQuery = {}): Observable<CustomerArStatement> {
    return this.api.get<CustomerArStatement>(
      `/api/v1/accounts-receivable/customers/${customerId}/statement`,
      { ...query },
    );
  }

  getAging(query: ArAgingQuery = {}): Observable<ArAgingResult> {
    return this.api.get<ArAgingResult>('/api/v1/accounts-receivable/aging', { ...query });
  }

  getReconciliation(): Observable<ArReconciliationSummary> {
    return this.api.get<ArReconciliationSummary>('/api/v1/accounts-receivable/reconciliation');
  }
}
