import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
} from '@angular/core';
import { NgForm } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiClientError } from '../../../core/api/api.types';

@Component({
  selector: 'app-login-boxed',
  templateUrl: './login-boxed.component.html',
  styleUrls: ['./login-boxed.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
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
    private readonly cdr: ChangeDetectorRef,
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
          this.cdr.detectChanges();
        },
        error: (err: unknown) => {
          this.submitting = false;
          if (err instanceof ApiClientError) {
            this.errorMessage = err.messages.join(' ');
          } else {
            this.errorMessage = 'Login failed. Please try again.';
          }
          this.cdr.detectChanges();
        },
      });
  }
}
