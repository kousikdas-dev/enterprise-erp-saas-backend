import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../core/api/api-client.service';
import { MasterDataList } from './master-data.models';

@Injectable({ providedIn: 'root' })
export class MasterDataService {
  constructor(private readonly api: ApiClient) {}

  // These four resources are not in the gateway's globalPrefixExcludes list,
  // so (unlike other resources) they keep the 'api' global prefix.
  paymentTerms(): Observable<MasterDataList> {
    return this.api.get<MasterDataList>('/api/v1/payment-terms');
  }

  paymentMethods(): Observable<MasterDataList> {
    return this.api.get<MasterDataList>('/api/v1/payment-methods');
  }

  fiscalPositions(): Observable<MasterDataList> {
    return this.api.get<MasterDataList>('/api/v1/fiscal-positions');
  }

  industries(): Observable<MasterDataList> {
    return this.api.get<MasterDataList>('/api/v1/industries');
  }
}
