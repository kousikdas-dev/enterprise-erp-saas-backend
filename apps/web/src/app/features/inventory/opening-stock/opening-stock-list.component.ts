import {
  Component,
  OnInit,
  TemplateRef,
  ViewChild,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { forkJoin } from 'rxjs';
import { ApiClientError } from '../../../core/api/api.types';
import { AppPermissions } from '../../../core/permissions/permissions.constants';
import { PermissionService } from '../../../core/permissions/permission.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { Product, ProductUnit, Unit, Warehouse } from '../models/inventory.models';
import { ProductService } from '../products/product.service';
import { UnitService } from '../units/unit.service';
import { WarehouseService } from '../warehouses/warehouse.service';
import { activeOpeningStockLabel } from './opening-stock-conflict.util';
import {
  CreateOpeningStockLineRequest,
  DuplicateActiveConflictDetail,
  ExistingStockConflictDetail,
  OPENING_STOCK_ERROR_CODES,
  OpeningStock,
  OpeningStockLine,
  SubsequentActivityConflictDetail,
} from './opening-stock.models';
import { OpeningStockService } from './opening-stock.service';

interface ConflictRow {
  [label: string]: string;
}

@Component({
  selector: 'app-opening-stock-list',
  templateUrl: './opening-stock-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class OpeningStockListComponent implements OnInit {
  @ViewChild('detailModal') detailModal!: TemplateRef<unknown>;

  private readonly openingStock = inject(OpeningStockService);
  private readonly productService = inject(ProductService);
  private readonly warehouseService = inject(WarehouseService);
  private readonly unitService = inject(UnitService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canCreate = this.permissions.has(AppPermissions.OPENING_STOCK_CREATE);
  readonly canPost = this.permissions.has(AppPermissions.OPENING_STOCK_POST);
  readonly canReverse = this.permissions.has(AppPermissions.OPENING_STOCK_REVERSE);

  items: OpeningStock[] = [];
  products: Product[] = [];
  warehouses: Warehouse[] = [];
  units: Unit[] = [];
  private productUnitsByProduct = new Map<string, ProductUnit[]>();
  private loadingProductUnits = new Set<string>();

  loading = false;
  error: string | null = null;
  filterStatus = '';
  filterWarehouseId = '';
  filterProductId = '';

  current: OpeningStock | null = null;
  creating = false;
  draftLines: CreateOpeningStockLineRequest[] = [];
  saving = false;
  addingLine = false;
  reverseReason = '';
  conflictMessage: string | null = null;
  conflictRows: ConflictRow[] | null = null;
  private modalRef?: NgbModalRef;

  headerForm = this.fb.group({
    effectiveDate: ['', Validators.required],
    notes: ['', Validators.maxLength(500)],
  });

  lineForm = this.fb.group({
    productId: ['', Validators.required],
    warehouseId: ['', Validators.required],
    quantity: ['', [Validators.required, Validators.pattern(/^\d+(\.\d+)?$/)]],
    unitOfMeasureId: ['', Validators.required],
  });

  ngOnInit(): void {
    this.loadLookups();
    this.load();
  }

  loadLookups(): void {
    forkJoin({
      products: this.productService.list(),
      warehouses: this.warehouseService.list(),
      units: this.unitService.list(),
    }).subscribe({
      next: ({ products, warehouses, units }) => {
        this.products = products.items ?? [];
        this.warehouses = warehouses.items ?? [];
        this.units = units.items ?? [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load lookups'));
        this.cdr.detectChanges();
      },
    });
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.openingStock
      .list({
        status: (this.filterStatus || undefined) as never,
        warehouseId: this.filterWarehouseId || undefined,
        productId: this.filterProductId || undefined,
      })
      .subscribe({
        next: (res) => {
          this.items = res.items ?? [];
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.loading = false;
          this.error = apiErrorMessage(err, 'Failed to load opening stock documents');
          this.cdr.detectChanges();
        },
      });
  }

  productLabel(id: string): string {
    const p = this.products.find((x) => x.id === id);
    return p ? `${p.sku} — ${p.name}` : id.slice(0, 8);
  }

  warehouseLabel(id: string): string {
    const w = this.warehouses.find((x) => x.id === id);
    return w ? `${w.code} — ${w.name}` : id.slice(0, 8);
  }

  uomLabel(id: string): string {
    const u = this.units.find((x) => x.id === id);
    return u ? u.code : id.slice(0, 8);
  }

  statusBadgeClass(status: string): string {
    switch (status) {
      case 'DRAFT':
        return 'bg-secondary';
      case 'POSTED':
        return 'bg-success';
      case 'REVERSED':
        return 'bg-danger';
      default:
        return 'bg-light text-dark';
    }
  }

  onLineProductChange(productId: string): void {
    this.lineForm.patchValue({ unitOfMeasureId: '' }, { emitEvent: false });
    this.ensureProductUnitsLoaded(productId);
  }

  private ensureProductUnitsLoaded(productId: string): void {
    if (!productId || this.productUnitsByProduct.has(productId) || this.loadingProductUnits.has(productId)) {
      return;
    }
    this.loadingProductUnits.add(productId);
    this.productService.listUnits(productId).subscribe({
      next: (res) => {
        this.productUnitsByProduct.set(productId, res.items ?? []);
        this.loadingProductUnits.delete(productId);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loadingProductUnits.delete(productId);
        this.toast.error(apiErrorMessage(err, 'Failed to load UOM options'));
        this.cdr.detectChanges();
      },
    });
  }

  /** UOM select options for the line form's chosen product: base unit + active alternative units. */
  uomOptionsFor(productId: string): Array<{ id: string; label: string }> {
    const product = this.products.find((p) => p.id === productId);
    if (!product) {
      return [];
    }
    const options: Array<{ id: string; label: string }> = [];
    const baseUnit = this.units.find((u) => u.id === product.unitOfMeasureId);
    if (baseUnit) {
      options.push({ id: baseUnit.id, label: `${baseUnit.code} — ${baseUnit.name}` });
    }
    const alternatives = this.productUnitsByProduct.get(productId) ?? [];
    for (const alt of alternatives) {
      if (!alt.isActive || alt.unitOfMeasureId === product.unitOfMeasureId) {
        continue;
      }
      const unit = this.units.find((u) => u.id === alt.unitOfMeasureId);
      if (unit) {
        options.push({ id: unit.id, label: `${unit.code} — ${unit.name}` });
      }
    }
    return options;
  }

  /**
   * Opens a blank, unsaved creation form. Nothing is persisted here — the
   * OpeningStock document is only created when the user clicks Save
   * (saveCreate()), so closing this modal without saving leaves no DRAFT
   * behind.
   */
  openCreate(): void {
    if (!this.canCreate) {
      return;
    }
    this.current = null;
    this.creating = true;
    this.draftLines = [];
    this.conflictMessage = null;
    this.conflictRows = null;
    this.reverseReason = '';
    this.resetLineForm();
    const effectiveDate = new Date().toISOString().slice(0, 10);
    this.headerForm.reset({ effectiveDate, notes: '' });
    this.modalRef = this.modal.open(this.detailModal, { centered: true, size: 'lg' });
  }

  /** Creates the DRAFT document with the staged header + lines in one call. */
  saveCreate(): void {
    if (!this.creating || this.headerForm.invalid || this.draftLines.length === 0 || this.saving) {
      return;
    }
    const value = this.headerForm.getRawValue();
    this.saving = true;
    this.cdr.detectChanges();
    this.openingStock
      .create({
        effectiveDate: value.effectiveDate!,
        notes: value.notes?.trim() || undefined,
        lines: this.draftLines,
      })
      .subscribe({
        next: (doc) => {
          this.saving = false;
          this.creating = false;
          this.draftLines = [];
          // Modal is already open (from openCreate()) — just swap it from the
          // blank-creation view to the normal persisted-document view, rather
          // than opening a second modal on top of it.
          this.current = doc;
          this.resetLineForm();
          this.headerForm.reset({
            effectiveDate: doc.effectiveDate.slice(0, 10),
            notes: doc.notes ?? '',
          });
          this.toast.success('Opening stock created');
          this.load();
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          this.toast.error(apiErrorMessage(err, 'Failed to create opening stock document'));
          this.cdr.detectChanges();
        },
      });
  }

  openDetail(row: OpeningStock): void {
    this.current = row;
    this.creating = false;
    this.draftLines = [];
    this.conflictMessage = null;
    this.conflictRows = null;
    this.reverseReason = '';
    this.resetLineForm();
    this.headerForm.reset({
      effectiveDate: row.effectiveDate.slice(0, 10),
      notes: row.notes ?? '',
    });
    this.modalRef = this.modal.open(this.detailModal, { centered: true, size: 'lg' });
  }

  saveHeader(): void {
    if (!this.current || this.current.status !== 'DRAFT' || this.headerForm.invalid || this.saving) {
      return;
    }
    const value = this.headerForm.getRawValue();
    this.saving = true;
    this.cdr.detectChanges();
    this.openingStock
      .update(this.current.id, {
        effectiveDate: value.effectiveDate!,
        notes: value.notes?.trim() || undefined,
      })
      .subscribe({
        next: (doc) => {
          this.saving = false;
          this.current = doc;
          this.toast.success('Saved');
          this.load();
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          this.toast.error(apiErrorMessage(err, 'Failed to save'));
          this.cdr.detectChanges();
        },
      });
  }

  addLine(): void {
    if (this.lineForm.invalid || this.addingLine) {
      this.lineForm.markAllAsTouched();
      return;
    }
    const value = this.lineForm.getRawValue();
    const line: CreateOpeningStockLineRequest = {
      productId: value.productId!,
      warehouseId: value.warehouseId!,
      quantity: String(value.quantity).trim(),
      unitOfMeasureId: value.unitOfMeasureId!,
    };

    if (this.creating) {
      const duplicate = this.draftLines.some(
        (l) => l.productId === line.productId && l.warehouseId === line.warehouseId,
      );
      if (duplicate) {
        this.toast.error('This document already has a line for that product and warehouse');
        return;
      }
      this.draftLines = [...this.draftLines, line];
      this.resetLineForm();
      this.cdr.detectChanges();
      return;
    }

    if (!this.current) {
      return;
    }
    this.addingLine = true;
    this.cdr.detectChanges();
    this.openingStock.addLine(this.current.id, line).subscribe({
      next: (doc) => {
        this.addingLine = false;
        this.current = doc;
        this.resetLineForm();
        this.load();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.addingLine = false;
        this.toast.error(apiErrorMessage(err, 'Failed to add line'));
        this.cdr.detectChanges();
      },
    });
  }

  /** Removes a not-yet-saved line from the in-progress creation form (no API call). */
  removeDraftLine(index: number): void {
    this.draftLines = this.draftLines.filter((_, i) => i !== index);
  }

  removeLine(line: OpeningStockLine): void {
    if (!this.current) {
      return;
    }
    this.openingStock.removeLine(this.current.id, line.id).subscribe({
      next: (doc) => {
        this.current = doc;
        this.load();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to remove line'));
        this.cdr.detectChanges();
      },
    });
  }

  post(): void {
    if (!this.current || !this.canPost || this.saving) {
      return;
    }
    this.saving = true;
    this.conflictMessage = null;
    this.conflictRows = null;
    this.cdr.detectChanges();
    this.openingStock.post(this.current.id).subscribe({
      next: (doc) => {
        this.saving = false;
        this.current = doc;
        this.toast.success(
          doc.code === OPENING_STOCK_ERROR_CODES.ALREADY_POSTED
            ? 'This document was already posted'
            : 'Opening stock posted',
        );
        this.load();
        this.cdr.detectChanges();
      },
      error: (err: unknown) => {
        this.saving = false;
        if (err instanceof ApiClientError && err.code === OPENING_STOCK_ERROR_CODES.BLOCKED_EXISTING_STOCK) {
          this.conflictMessage =
            'Cannot post: one or more lines already have non-zero stock. Remove those lines or correct them via Stock Adjustment instead.';
          this.conflictRows = (err.details as ExistingStockConflictDetail[]).map((d) => ({
            Product: this.productLabel(d.productId),
            Warehouse: this.warehouseLabel(d.warehouseId),
            'Existing quantity': d.existingQuantity,
          }));
        } else if (err instanceof ApiClientError && err.code === OPENING_STOCK_ERROR_CODES.DUPLICATE_ACTIVE) {
          this.conflictMessage =
            'Cannot post: another active (posted, not reversed) opening stock document already covers one of these lines.';
          this.conflictRows = (err.details as DuplicateActiveConflictDetail[]).map((d) => ({
            'Active Opening Stock': activeOpeningStockLabel(d),
            Product: this.productLabel(d.productId),
            Warehouse: this.warehouseLabel(d.warehouseId),
          }));
        } else {
          this.toast.error(apiErrorMessage(err, 'Failed to post opening stock document'));
        }
        this.cdr.detectChanges();
      },
    });
  }

  reverse(): void {
    if (!this.current || !this.canReverse || this.saving) {
      return;
    }
    this.saving = true;
    this.conflictMessage = null;
    this.conflictRows = null;
    this.cdr.detectChanges();
    this.openingStock
      .reverse(this.current.id, { reason: this.reverseReason.trim() || undefined })
      .subscribe({
        next: (doc) => {
          this.saving = false;
          this.current = doc;
          this.toast.success(
            doc.code === OPENING_STOCK_ERROR_CODES.ALREADY_REVERSED
              ? 'This document was already reversed'
              : 'Opening stock reversed',
          );
          this.load();
          this.cdr.detectChanges();
        },
        error: (err: unknown) => {
          this.saving = false;
          if (
            err instanceof ApiClientError &&
            err.code === OPENING_STOCK_ERROR_CODES.REVERSAL_BLOCKED_SUBSEQUENT_ACTIVITY
          ) {
            this.conflictMessage =
              'Cannot reverse: stock activity has occurred on one or more affected products/warehouses since this document was posted. Use a Stock Adjustment for a manual correction instead.';
            this.conflictRows = (err.details as SubsequentActivityConflictDetail[]).map((d) => ({
              Product: this.productLabel(d.productId),
              Warehouse: this.warehouseLabel(d.warehouseId),
              'Later activity': d.subsequentMovementType,
              'At': new Date(d.subsequentMovementCreatedAt).toLocaleString(),
            }));
          } else {
            this.toast.error(apiErrorMessage(err, 'Failed to reverse opening stock document'));
          }
          this.cdr.detectChanges();
        },
      });
  }

  private resetLineForm(): void {
    this.lineForm.reset({ productId: '', warehouseId: '', quantity: '', unitOfMeasureId: '' });
  }
}
