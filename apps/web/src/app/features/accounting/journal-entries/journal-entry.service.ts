import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CreateJournalEntryRequest,
  JournalEntry,
  JournalEntryList,
  UpdateJournalEntryRequest,
} from '../models/accounting.models';

@Injectable({ providedIn: 'root' })
export class JournalEntryService {
  constructor(private readonly api: ApiClient) {}

  list(): Observable<JournalEntryList> {
    return this.api.get<JournalEntryList>('/v1/journal-entries');
  }

  getById(id: string): Observable<JournalEntry> {
    return this.api.get<JournalEntry>(`/v1/journal-entries/${id}`);
  }

  create(body: CreateJournalEntryRequest): Observable<JournalEntry> {
    return this.api.post<JournalEntry>('/v1/journal-entries', body);
  }

  update(id: string, body: UpdateJournalEntryRequest): Observable<JournalEntry> {
    return this.api.patch<JournalEntry>(`/v1/journal-entries/${id}`, body);
  }

  post(id: string): Observable<JournalEntry> {
    return this.api.post<JournalEntry>(`/v1/journal-entries/${id}/post`);
  }
}
