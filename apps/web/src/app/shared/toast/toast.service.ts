import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ToastKind = 'success' | 'danger' | 'warning' | 'info';

export interface ToastMessage {
  id: number;
  kind: ToastKind;
  text: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private seq = 0;
  private readonly subject = new BehaviorSubject<ToastMessage[]>([]);
  readonly messages$ = this.subject.asObservable();

  success(text: string): void {
    this.push('success', text);
  }

  error(text: string): void {
    this.push('danger', text);
  }

  warning(text: string): void {
    this.push('warning', text);
  }

  info(text: string): void {
    this.push('info', text);
  }

  dismiss(id: number): void {
    this.subject.next(this.subject.value.filter((m) => m.id !== id));
  }

  private push(kind: ToastKind, text: string): void {
    const id = ++this.seq;
    this.subject.next([...this.subject.value, { id, kind, text }]);
    window.setTimeout(() => this.dismiss(id), 4500);
  }
}
