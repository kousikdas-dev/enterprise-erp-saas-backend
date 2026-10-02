import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  BalanceSheetQuery,
  BalanceSheetResponse,
  ProfitLossQuery,
  ProfitLossResponse,
  TrialBalanceQuery,
  TrialBalanceResponse,
} from '../models/accounting.models';

@Injectable({ providedIn: 'root' })
export class ReportsService {
  constructor(private readonly api: ApiClient) {}

  getTrialBalance(query: TrialBalanceQuery): Observable<TrialBalanceResponse> {
    return this.api.get<TrialBalanceResponse>('/v1/reports/trial-balance', query);
  }

  getProfitLoss(query: ProfitLossQuery): Observable<ProfitLossResponse> {
    return this.api.get<ProfitLossResponse>('/v1/reports/profit-loss', query);
  }

  getBalanceSheet(query: BalanceSheetQuery): Observable<BalanceSheetResponse> {
    return this.api.get<BalanceSheetResponse>('/v1/reports/balance-sheet', query);
  }
}
