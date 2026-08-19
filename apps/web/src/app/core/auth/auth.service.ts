import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { ApiClient } from '../api/api-client.service';
import {
  AuthMeResponse,
  CurrentUser,
  LoginRequest,
  LoginResponse,
} from './auth.models';
import { CurrentUserService } from './current-user.service';

const ACCESS_TOKEN_KEY = 'erp.accessToken';
const REFRESH_TOKEN_KEY = 'erp.refreshToken';

@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(
    private readonly api: ApiClient,
    private readonly currentUser: CurrentUserService,
    private readonly router: Router,
  ) {}

  getAccessToken(): string | null {
    return sessionStorage.getItem(ACCESS_TOKEN_KEY);
  }

  isAuthenticated(): boolean {
    return !!this.getAccessToken();
  }

  login(credentials: LoginRequest): Observable<CurrentUser> {
    return this.api.post<LoginResponse>('/v1/auth/login', credentials).pipe(
      tap((tokens) => {
        sessionStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
        // Stored for this browser session only. No public refresh endpoint is used.
        sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
      }),
      switchMap(() => this.fetchMe()),
    );
  }

  /**
   * Restores CurrentUser from /v1/auth/me when a session token exists.
   */
  ensureSession(): Observable<boolean> {
    if (!this.isAuthenticated()) {
      this.currentUser.clear();
      return of(false);
    }
    if (this.currentUser.snapshot) {
      return of(true);
    }
    return this.fetchMe().pipe(
      map(() => true),
      catchError(() => {
        this.clearSession();
        return of(false);
      }),
    );
  }

  logout(navigate = true): void {
    this.clearSession();
    if (navigate) {
      void this.router.navigate(['/auth/login']);
    }
  }

  clearSession(): void {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    this.currentUser.clear();
  }

  private fetchMe(): Observable<CurrentUser> {
    return this.api.get<AuthMeResponse>('/v1/auth/me').pipe(
      map((me) => ({
        userId: me.userId,
        tenantId: me.tenantId,
      })),
      tap((user) => this.currentUser.setUser(user)),
    );
  }
}
