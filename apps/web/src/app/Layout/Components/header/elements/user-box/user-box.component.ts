import { Component, ChangeDetectionStrategy } from '@angular/core';
import { ThemeOptions } from '../../../../../theme-options';
import { AuthService } from '../../../../../core/auth/auth.service';
import { CurrentUserService } from '../../../../../core/auth/current-user.service';
import { Observable, map } from 'rxjs';

@Component({
  selector: 'app-user-box',
  templateUrl: './user-box.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class UserBoxComponent {
  readonly displayName$: Observable<string>;
  readonly displaySubheading$: Observable<string>;

  constructor(
    public globals: ThemeOptions,
    private readonly auth: AuthService,
    private readonly currentUser: CurrentUserService,
  ) {
    this.displayName$ = this.currentUser.user$.pipe(
      map((user) => (user ? `User ${user.userId.slice(0, 8)}…` : 'Signed in')),
    );
    this.displaySubheading$ = this.currentUser.user$.pipe(
      map((user) => (user ? `Tenant ${user.tenantId.slice(0, 8)}…` : '')),
    );
  }

  logout(): void {
    this.auth.logout(true);
  }
}
