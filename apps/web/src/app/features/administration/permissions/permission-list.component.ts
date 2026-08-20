import {
  Component,
  OnInit,
  TemplateRef,
  ViewChild,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { ToastService } from '../../../shared/toast/toast.service';
import { Permission } from '../models/administration.models';
import { PermissionCatalogService } from './permission.service';

@Component({
  selector: 'app-permission-list',
  templateUrl: './permission-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class PermissionListComponent implements OnInit {
  @ViewChild('detailModal') detailModal!: TemplateRef<unknown>;

  private readonly catalog = inject(PermissionCatalogService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef);

  items: Permission[] = [];
  loading = false;
  error: string | null = null;
  filter = '';
  viewing: Permission | null = null;

  ngOnInit(): void {
    this.load();
  }

  get filtered(): Permission[] {
    const q = this.filter.trim().toLowerCase();
    if (!q) {
      return this.items;
    }
    return this.items.filter(
      (p) =>
        p.key.toLowerCase().includes(q) ||
        p.resource.toLowerCase().includes(q) ||
        p.action.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q),
    );
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.catalog.list().subscribe({
      next: (res) => {
        this.items = res.items ?? [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load permissions');
        this.cdr.detectChanges();
      },
    });
  }

  openDetail(item: Permission): void {
    this.viewing = item;
    this.modal.open(this.detailModal, { centered: true });
    this.catalog.getById(item.id).subscribe({
      next: (detail) => {
        this.viewing = detail;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load permission details'));
        this.cdr.detectChanges();
      },
    });
  }
}
