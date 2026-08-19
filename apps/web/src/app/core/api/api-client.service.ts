import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { ApiClientError, ApiEnvelope } from './api.types';

type Query = Record<string, string | number | boolean | undefined | null>;

@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/$/, '');

  constructor(private readonly http: HttpClient) {}

  get<T>(path: string, query?: Query | object): Observable<T> {
    return this.http
      .get<ApiEnvelope<T>>(this.url(path), { params: this.toParams(query as Query | undefined) })
      .pipe(map((body) => this.unwrap(body)), catchError((err) => this.handle(err)));
  }

  post<T>(path: string, body?: unknown): Observable<T> {
    return this.http
      .post<ApiEnvelope<T>>(this.url(path), body ?? {})
      .pipe(map((res) => this.unwrap(res)), catchError((err) => this.handle(err)));
  }

  patch<T>(path: string, body?: unknown): Observable<T> {
    return this.http
      .patch<ApiEnvelope<T>>(this.url(path), body ?? {})
      .pipe(map((res) => this.unwrap(res)), catchError((err) => this.handle(err)));
  }

  put<T>(path: string, body?: unknown): Observable<T> {
    return this.http
      .put<ApiEnvelope<T>>(this.url(path), body ?? {})
      .pipe(map((res) => this.unwrap(res)), catchError((err) => this.handle(err)));
  }

  delete<T>(path: string): Observable<T> {
    return this.http
      .delete<ApiEnvelope<T>>(this.url(path))
      .pipe(map((res) => this.unwrap(res)), catchError((err) => this.handle(err)));
  }

  private url(path: string): string {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return `${this.baseUrl}${normalized}`;
  }

  private toParams(query?: Query): HttpParams | undefined {
    if (!query) {
      return undefined;
    }
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) {
        continue;
      }
      params = params.set(key, String(value));
    }
    return params;
  }

  private unwrap<T>(body: ApiEnvelope<T>): T {
    if (body?.data === undefined) {
      throw new ApiClientError(body?.statusCode ?? 502, [
        'Unexpected API response envelope',
      ]);
    }
    return body.data;
  }

  private handle(error: unknown): Observable<never> {
    if (error instanceof ApiClientError) {
      return throwError(() => error);
    }
    if (error instanceof HttpErrorResponse) {
      const payload = error.error as ApiEnvelope<unknown> | string | null;
      const messages = this.extractMessages(payload, error.message);
      return throwError(() => new ApiClientError(error.status || 0, messages));
    }
    return throwError(
      () => new ApiClientError(0, ['Unexpected client error']),
    );
  }

  private extractMessages(
    payload: ApiEnvelope<unknown> | string | null,
    fallback: string,
  ): string[] {
    if (!payload) {
      return [fallback];
    }
    if (typeof payload === 'string') {
      return [payload];
    }
    const message = payload.message;
    if (typeof message === 'string' && message.length > 0) {
      return [message];
    }
    if (Array.isArray(message) && message.every((item) => typeof item === 'string')) {
      return message;
    }
    return [fallback];
  }
}
