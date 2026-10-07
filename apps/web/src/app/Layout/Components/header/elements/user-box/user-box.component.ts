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
      map((user) => {
        if (!user) {
          return 'Signed in';
        }
        // Existing sessions signed in before userName was added to the
        // access token won't have it until they log in again.
        return user.userName ?? `User ${user.userId.slice(0, 8)}…`;
      }),
    );
    this.displaySubheading$ = this.currentUser.user$.pipe(
      map((user) => {
        if (!user) {
          return '';
        }
        // Existing sessions signed in before tenantName was added to the
        // access token won't have it until they log in again.
        return user.tenantName ?? `Tenant ${user.tenantId.slice(0, 8)}…`;
      }),
    );
  }

  logout(): void {
    this.auth.logout(true);
  }
}
