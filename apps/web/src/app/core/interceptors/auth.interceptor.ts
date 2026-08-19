import {
  HttpErrorResponse,
  HttpInterceptorFn,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.getAccessToken();
  const withAuth =
    token && !req.url.includes('/v1/auth/login')
      ? req.clone({
          setHeaders: { Authorization: `Bearer ${token}` },
        })
      : req;

  return next(withAuth).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        const isLoginCall = req.url.includes('/v1/auth/login');
        if (!isLoginCall && auth.isAuthenticated()) {
          auth.logout(true);
        }
      }
      return throwError(() => error);
    }),
  );
};
