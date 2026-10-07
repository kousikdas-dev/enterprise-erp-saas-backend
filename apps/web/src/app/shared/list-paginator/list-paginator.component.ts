import {
  Component,
  DoCheck,
  ElementRef,
  Input,
  OnDestroy,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';

/**
 * Client-side page slicer + range control for list pages (Odoo-style
 * "1-20 / 134" with prev/next). Give it the full filtered array and read
 * `pageItems` back via a template reference variable:
 *
 *   <app-list-paginator #pager [items]="filtered"></app-list-paginator>
 *   ...
 *   <tr *ngFor="let item of pager.pageItems">
 *
 * Keeps every list component's own filtering/loading logic untouched —
 * this only slices the already-filtered array for display.
 */
@Component({
  selector: 'app-list-paginator',
  templateUrl: './list-paginator.component.html',
  styleUrl: './list-paginator.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: true,
  imports: [],
  exportAs: 'appListPaginator',
})
export class ListPaginatorComponent<T = unknown> implements DoCheck, OnDestroy {
  @Input() items: T[] = [];
  @Input() pageSize = 20;

  private readonly requestedPage = signal(1);
  private readonly tooltips: { dispose(): void }[] = [];

  constructor(private readonly elementRef: ElementRef<HTMLElement>) {}

  get totalItems(): number {
    return this.items?.length ?? 0;
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.totalItems / this.pageSize));
  }

  get currentPage(): number {
    return Math.min(Math.max(1, this.requestedPage()), this.totalPages);
  }

  get pageItems(): T[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return (this.items ?? []).slice(start, start + this.pageSize);
  }

  get rangeStart(): number {
    return this.totalItems === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1;
  }

  get rangeEnd(): number {
    return Math.min(this.rangeStart + this.pageSize - 1, this.totalItems);
  }

  prev(): void {
    this.requestedPage.set(Math.max(1, this.currentPage - 1));
  }

  next(): void {
    this.requestedPage.set(Math.min(this.totalPages, this.currentPage + 1));
  }

  /**
   * The pagination/view-switcher buttons only exist in the DOM once
   * `totalItems > 0` (async data load), so a one-shot afterNextRender
   * would usually fire before they're there. ngDoCheck runs every change
   * detection pass and only does real work for not-yet-initialized
   * triggers (cheap once they're all marked), catching them whenever they
   * do appear.
   */
  ngDoCheck(): void {
    const bootstrap = typeof window !== 'undefined' ? window.bootstrap : undefined;
    if (!bootstrap) {
      return;
    }
    const triggers = this.elementRef.nativeElement.querySelectorAll(
      '[data-bs-toggle="tooltip"]:not([data-tooltip-ready])',
    );
    triggers.forEach((el) => {
      el.setAttribute('data-tooltip-ready', 'true');
      this.tooltips.push(new bootstrap.Tooltip(el));
    });
  }

  ngOnDestroy(): void {
    this.tooltips.forEach((tooltip) => tooltip.dispose());
  }
}
