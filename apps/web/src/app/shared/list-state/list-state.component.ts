import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-list-state',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="loading" class="text-center text-muted py-5">
      <div class="spinner-border text-primary mb-2" role="status"></div>
      <div>Loading…</div>
    </div>

    <div *ngIf="!loading && error" class="alert alert-danger d-flex justify-content-between align-items-center" role="alert">
      <span>{{ error }}</span>
      <button type="button" class="btn btn-sm btn-outline-danger" (click)="retry.emit()">Retry</button>
    </div>

    <div *ngIf="!loading && !error && empty" class="text-center text-muted py-5">
      <i class="pe-7s-box1" style="font-size: 2rem;"></i>
      <div class="mt-2">{{ emptyMessage }}</div>
    </div>

    <div *ngIf="!loading && !error && !empty">
      <ng-content></ng-content>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class ListStateComponent {
  @Input() loading = false;
  @Input() error: string | null = null;
  @Input() empty = false;
  @Input() emptyMessage = 'No records found.';
  @Output() retry = new EventEmitter<void>();
}
