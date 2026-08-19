import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule, NgbModule],
  template: `
    <div class="toast-container position-fixed top-0 end-0 p-3" style="z-index: 1200;">
      <ngb-toast
        *ngFor="let toast of toastService.messages$ | async"
        [class]="'text-bg-' + toast.kind"
        [autohide]="false"
        (hidden)="toastService.dismiss(toast.id)">
        <div class="d-flex align-items-center">
          <div class="me-auto">{{ toast.text }}</div>
          <button
            type="button"
            class="btn-close btn-close-white ms-2"
            aria-label="Close"
            (click)="toastService.dismiss(toast.id)"></button>
        </div>
      </ngb-toast>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class ToastContainerComponent {
  constructor(public readonly toastService: ToastService) {}
}
