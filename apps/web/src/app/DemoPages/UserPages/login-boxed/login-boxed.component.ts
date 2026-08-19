import { Component, ChangeDetectionStrategy } from '@angular/core';
import { NgForm } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiClientError } from '../../../core/api/api.types';

@Component({
  selector: 'app-login-boxed',
  templateUrl: './login-boxed.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [],
})
export class LoginBoxedComponent {
  tenantCode = '';
  email = '';
  password = '';
  submitting = false;
  errorMessage: string | null = null;

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
  ) {}

  onSubmit(form: NgForm): void {
    if (form.invalid || this.submitting) {
      return;
    }

    this.submitting = true;
    this.errorMessage = null;

    this.auth
      .login({
        tenantCode: this.tenantCode.trim(),
        email: this.email.trim(),
        password: this.password,
      })
      .subscribe({
        next: () => {
          this.submitting = false;
          const returnUrl =
            this.route.snapshot.queryParamMap.get('returnUrl') || '/dashboard';
          void this.router.navigateByUrl(returnUrl);
        },
        error: (err: unknown) => {
          this.submitting = false;
          if (err instanceof ApiClientError) {
            this.errorMessage = err.messages.join(' ');
          } else {
            this.errorMessage = 'Login failed. Please try again.';
          }
        },
      });
  }
}
