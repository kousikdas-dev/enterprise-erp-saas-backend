import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { CurrentUser } from './auth.models';

@Injectable({ providedIn: 'root' })
export class CurrentUserService {
  private readonly userSubject = new BehaviorSubject<CurrentUser | null>(null);
  readonly user$ = this.userSubject.asObservable();

  get snapshot(): CurrentUser | null {
    return this.userSubject.value;
  }

  setUser(user: CurrentUser | null): void {
    this.userSubject.next(user);
  }

  clear(): void {
    this.userSubject.next(null);
  }
}
