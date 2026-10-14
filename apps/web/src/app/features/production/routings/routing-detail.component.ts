import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AppPermissions } from '../../../core/permissions/permissions.constants';
import { PermissionService } from '../../../core/permissions/permission.service';
import { Product } from '../../inventory/models/inventory.models';
import { ProductService } from '../../inventory/products/product.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import { isPositiveDecimal } from '../../../shared/utils/decimal.util';
import { Operation, Routing, RoutingStepLineInput, WorkCentre } from '../models/production.models';
import { OperationService } from '../operations/operation.service';
import { WorkCentreService } from '../work-centres/work-centre.service';
import { RoutingService } from './routing.service';

type PendingActionType = 'activate' | 'deactivate' | 'new-version';

@Component({
  selector: 'app-routing-detail',
  templateUrl: './routing-detail.component.html',
  styleUrls: ['./routing-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class RoutingDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly routings = inject(RoutingService);
  private readonly productService = inject(ProductService);
  private readonly operationService = inject(OperationService);
  private readonly workCentreService = inject(WorkCentreService);
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canCreate = this.permissions.has(AppPermissions.PRODUCTION_ROUTINGS_CREATE);
  readonly canUpdate = this.permissions.has(AppPermissions.PRODUCTION_ROUTINGS_UPDATE);
  readonly canActivate = this.permissions.has(AppPermissions.PRODUCTION_ROUTINGS_ACTIVATE);
  readonly canDeactivate = this.permissions.has(AppPermissions.PRODUCTION_ROUTINGS_DEACTIVATE);

  isNew = true;
  routing: Routing | null = null;

  products: Product[] = [];
  operations: Operation[] = [];
  workCentres: WorkCentre[] = [];

  loading = false;
  saving = false;
  actionBusy = false;
  error: string | null = null;

  form = this.fb.group({
    productId: ['', Validators.required],
    name: ['', [Validators.required, Validators.maxLength(160)]],
    description: ['', Validators.maxLength(500)],
    effectiveFrom: [''],
    effectiveTo: [''],
    steps: this.fb.array<FormGroup>([]),
  });

  get steps(): FormArray<FormGroup> {
    return this.form.get('steps') as FormArray<FormGroup>;
  }

  get eligibleProducts(): Product[] {
    return this.products.filter((p) => p.isActive && p.trackInventory);
  }

  get activeOperations(): Operation[] {
    return this.operations.filter((o) => o.isActive);
  }

  get activeWorkCentres(): WorkCentre[] {
    return this.workCentres.filter((w) => w.isActive);
  }

  /** Form stays editable while creating, or editing a still-DRAFT routing. */
  get isEditable(): boolean {
    return this.isNew || this.routing?.status === 'DRAFT';
  }

  get canActivateRouting(): boolean {
    return !!this.routing && this.canActivate && this.routing.status !== 'ACTIVE';
  }

  get canDeactivateRouting(): boolean {
    return !!this.routing && this.canDeactivate && this.routing.status === 'ACTIVE';
  }

  get canNewVersion(): boolean {
    return !!this.routing && this.canCreate;
  }

  ngOnInit(): void {
    this.addStepRow();

    const id = this.route.snapshot.paramMap.get('id');
    this.isNew = !id || id === 'new';
    this.loadLookups();
    if (!this.isNew && id) {
      this.loadRouting(id);
    }
  }

  loadLookups(): void {
    forkJoin({
      products: this.productService.list(),
      operations: this.operationService.list(),
      workCentres: this.workCentreService.list(),
    }).subscribe({
      next: ({ products, operations, workCentres }) => {
        this.products = products.items ?? [];
        this.operations = operations.items ?? [];
        this.workCentres = workCentres.items ?? [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load product/operation/work centre lookups'));
        this.cdr.detectChanges();
      },
    });
  }

  loadRouting(id: string): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.routings.getById(id).subscribe({
      next: (routing) => {
        this.routing = routing;
        this.form.reset({
          productId: routing.productId,
          name: routing.name,
          description: routing.description ?? '',
          effectiveFrom: routing.effectiveFrom ? routing.effectiveFrom.slice(0, 10) : '',
          effectiveTo: routing.effectiveTo ? routing.effectiveTo.slice(0, 10) : '',
        });
        this.steps.clear();
        for (const step of routing.steps ?? []) {
          this.steps.push(
            this.createStepGroup(
              step.operationId,
              step.workCentreId,
              step.sequence,
              step.setupMinutes,
              step.runMinutesPerUnit,
              step.description ?? '',
            ),
          );
        }
        if (this.steps.length === 0) {
          this.addStepRow();
        }
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load routing');
        this.cdr.detectChanges();
      },
    });
  }

  createStepGroup(
    operationId = '',
    workCentreId = '',
    sequence = 10,
    setupMinutes = 0,
    runMinutesPerUnit = '0',
    description = '',
  ): FormGroup {
    return this.fb.group({
      operationId: [operationId, Validators.required],
      workCentreId: [workCentreId, Validators.required],
      sequence: [sequence, [Validators.required, Validators.min(1)]],
      setupMinutes: [
        setupMinutes,
        [Validators.required, Validators.pattern(/^\d+$/), Validators.min(0)],
      ],
      runMinutesPerUnit: [
        runMinutesPerUnit,
        [Validators.required, Validators.pattern(/^\d+(\.\d{1,6})?$/)],
      ],
      description: [description, Validators.maxLength(500)],
    });
  }

  addStepRow(): void {
    const nextSequence = this.steps.length
      ? Math.max(...this.steps.controls.map((c) => Number(c.value.sequence) || 0)) + 10
      : 10;
    this.steps.push(this.createStepGroup(undefined, undefined, nextSequence));
  }

  removeStepRow(index: number): void {
    if (this.steps.length <= 1) {
      return;
    }
    this.steps.removeAt(index);
  }

  operationLabel(id: string): string {
    const operation = this.operations.find((o) => o.id === id);
    return operation ? `${operation.code} — ${operation.name}` : id.slice(0, 8);
  }

  workCentreLabel(id: string): string {
    const workCentre = this.workCentres.find((w) => w.id === id);
    return workCentre ? `${workCentre.code} — ${workCentre.name}` : id.slice(0, 8);
  }

  statusBadgeClass(status: string): string {
    switch (status) {
      case 'DRAFT':
        return 'bg-secondary';
      case 'ACTIVE':
        return 'bg-success';
      case 'INACTIVE':
        return 'bg-dark';
      default:
        return 'bg-secondary';
    }
  }

  runAction(type: PendingActionType): void {
    if (!this.routing || this.actionBusy) {
      return;
    }
    const id = this.routing.id;
    this.actionBusy = true;
    this.cdr.detectChanges();

    const request$ =
      type === 'activate'
        ? this.routings.activate(id)
        : type === 'deactivate'
          ? this.routings.deactivate(id)
          : this.routings.newVersion(id);

    const successMessage: Record<PendingActionType, string> = {
      activate: 'Routing activated',
      deactivate: 'Routing deactivated',
      'new-version': 'New routing version created',
    };

    request$.subscribe({
      next: (updated) => {
        this.actionBusy = false;
        this.toast.success(successMessage[type]);
        if (type === 'new-version') {
          this.router.navigate(['/production/routings', updated.id]);
        } else {
          this.routing = updated;
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.actionBusy = false;
        this.toast.error(apiErrorMessage(err, 'Action failed'));
        this.cdr.detectChanges();
      },
    });
  }

  save(): void {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      this.steps.controls.forEach((step) => step.markAllAsTouched());
      return;
    }

    const value = this.form.getRawValue();
    if (value.effectiveFrom && value.effectiveTo && value.effectiveTo < value.effectiveFrom) {
      this.toast.error('Effective To cannot be before Effective From.');
      return;
    }

    const rawSteps = this.steps.getRawValue() as Array<{
      operationId: string;
      workCentreId: string;
      sequence: number;
      setupMinutes: number;
      runMinutesPerUnit: string;
      description: string;
    }>;
    for (const step of rawSteps) {
      if (!this.operations.find((o) => o.id === step.operationId)) {
        this.toast.error('Select a valid operation for every step.');
        return;
      }
      if (!this.workCentres.find((w) => w.id === step.workCentreId)) {
        this.toast.error('Select a valid work centre for every step.');
        return;
      }
      if (!isPositiveDecimal(String(step.sequence))) {
        this.toast.error('Sequence must be a positive number for every step.');
        return;
      }
    }
    const sequences = rawSteps.map((s) => s.sequence);
    if (new Set(sequences).size !== sequences.length) {
      this.toast.error('Each step must have a unique sequence number.');
      return;
    }

    // Always sent (even empty) — the form reflects the complete desired
    // steps list, and the backend treats a present (possibly empty) array
    // as "replace", distinct from an omitted field meaning "leave
    // unchanged" (which this page never wants, since it always loads the
    // full current state first).
    const steps: RoutingStepLineInput[] = rawSteps.map((step) => ({
      operationId: step.operationId,
      workCentreId: step.workCentreId,
      sequence: step.sequence,
      setupMinutes: Number(step.setupMinutes) || 0,
      runMinutesPerUnit: String(step.runMinutesPerUnit ?? '0').trim(),
      ...(step.description?.trim() ? { description: step.description.trim() } : {}),
    }));

    const description = value.description?.trim() || undefined;
    const effectiveFrom = value.effectiveFrom?.trim() || undefined;
    const effectiveTo = value.effectiveTo?.trim() || undefined;

    this.saving = true;
    this.cdr.detectChanges();

    const request$ = this.routing
      ? this.routings.update(this.routing.id, {
          name: value.name!.trim(),
          description,
          effectiveFrom,
          effectiveTo,
          steps,
        })
      : this.routings.create({
          productId: value.productId!,
          name: value.name!.trim(),
          description,
          effectiveFrom,
          effectiveTo,
          steps,
        });

    request$.subscribe({
      next: (result) => {
        this.saving = false;
        this.toast.success(this.routing ? 'Routing updated' : 'Routing created');
        this.router.navigate(['/production/routings', result.id]);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.saving = false;
        this.toast.error(apiErrorMessage(err, 'Save failed'));
        this.cdr.detectChanges();
      },
    });
  }

  discard(): void {
    this.router.navigate(['/production/routings']);
  }
}
