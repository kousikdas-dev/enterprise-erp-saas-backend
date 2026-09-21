import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CreateOpeningStockLineRequest,
  CreateOpeningStockRequest,
  OpeningStock,
  OpeningStockList,
  OpeningStockQuery,
  ReverseOpeningStockRequest,
  UpdateOpeningStockRequest,
} from './opening-stock.models';

@Injectable({ providedIn: 'root' })
export class OpeningStockService {
  constructor(private readonly api: ApiClient) {}

  list(query?: OpeningStockQuery): Observable<OpeningStockList> {
    return this.api.get<OpeningStockList>('/v1/opening-stock', query);
  }

  getById(id: string): Observable<OpeningStock> {
    return this.api.get<OpeningStock>(`/v1/opening-stock/${id}`);
  }

  create(body: CreateOpeningStockRequest): Observable<OpeningStock> {
    return this.api.post<OpeningStock>('/v1/opening-stock', body);
  }

  update(id: string, body: UpdateOpeningStockRequest): Observable<OpeningStock> {
    return this.api.patch<OpeningStock>(`/v1/opening-stock/${id}`, body);
  }

  addLine(id: string, body: CreateOpeningStockLineRequest): Observable<OpeningStock> {
    return this.api.post<OpeningStock>(`/v1/opening-stock/${id}/lines`, body);
  }

  removeLine(id: string, lineId: string): Observable<OpeningStock> {
    return this.api.delete<OpeningStock>(`/v1/opening-stock/${id}/lines/${lineId}`);
  }

  post(id: string): Observable<OpeningStock> {
    return this.api.post<OpeningStock>(`/v1/opening-stock/${id}/post`, {});
  }

  reverse(id: string, body: ReverseOpeningStockRequest): Observable<OpeningStock> {
    return this.api.post<OpeningStock>(`/v1/opening-stock/${id}/reverse`, body);
  }
}
