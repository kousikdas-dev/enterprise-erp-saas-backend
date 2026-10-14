import { ActivatedRoute } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { of, throwError } from 'rxjs';
import { SharedModule } from '../../../shared.module';
import { ListStateComponent } from '../../../shared/list-state/list-state.component';
import { PermissionService } from '../../../core/permissions/permission.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { WarehouseService } from '../../inventory/warehouses/warehouse.service';
import { UnbuildOrder } from '../models/production.models';
import { UnbuildOrderListComponent } from './unbuild-order-list.component';
import { UnbuildOrderService } from './unbuild-order.service';

describe('UnbuildOrderListComponent', () => {
  function order(overrides: Partial<UnbuildOrder> = {}): UnbuildOrder {
    return {
      id: 'ub-1',
      tenantId: 't1',
      orderNumber: 'UB-000001',
      productId: 'p1',
      productSku: 'TABLE-OAK',
      productName: 'Oak Table',
      bomId: 'bom1',
      bomVersion: 1,
      quantity: '2.000000',
      unitOfMeasureId: 'u1',
      uomCode: 'PCS',
      uomName: 'Piece',
      warehouseId: 'w1',
      sourceProductionOrderId: null,
      sourceProductionOrderNumber: null,
      status: 'DRAFT',
      unbuildDate: '2026-10-01',
      notes: null,
      completedAt: null,
      completedBy: null,
      finishedGoodsMovementId: null,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
      items: [],
      ...overrides,
    };
  }

  function configure(opts: {
    listResult?: { items: UnbuildOrder[]; total: number; page: number; pageSize: number };
    permissions?: Record<string, boolean>;
  } = {}) {
    const unbuildOrdersSpy = {
      list: jasmine.createSpy('list').and.returnValue(
        of(opts.listResult ?? { items: [order()], total: 1, page: 1, pageSize: 20 }),
      ),
      getById: jasmine.createSpy('getById'),
      complete: jasmine.createSpy('complete'),
      cancel: jasmine.createSpy('cancel'),
    };
    const warehouseSpy = { list: jasmine.createSpy('list').and.returnValue(of({ items: [] })) };
    const toastSpy = { success: jasmine.createSpy('success'), error: jasmine.createSpy('error') };
    const modalSpy = { open: jasmine.createSpy('open').and.returnValue({}) };
    const permissionValues = {
      [`production-unbuild-orders.create`]: true,
      [`production-unbuild-orders.update`]: true,
      [`production-unbuild-orders.complete`]: true,
      [`production-unbuild-orders.cancel`]: true,
      ...opts.permissions,
    };
    const permissionSpy = {
      has: jasmine.createSpy('has').and.callFake((key: string) => permissionValues[key] ?? true),
    };

    TestBed.configureTestingModule({
      imports: [SharedModule, ListStateComponent],
      declarations: [UnbuildOrderListComponent],
      providers: [
        { provide: UnbuildOrderService, useValue: unbuildOrdersSpy },
        { provide: WarehouseService, useValue: warehouseSpy },
        { provide: ToastService, useValue: toastSpy },
        { provide: NgbModal, useValue: modalSpy },
        { provide: PermissionService, useValue: permissionSpy },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => null } } } },
      ],
    });

    const fixture = TestBed.createComponent(UnbuildOrderListComponent);
    return { fixture, component: fixture.componentInstance, unbuildOrdersSpy, toastSpy, modalSpy };
  }

  it('loads the first page on init and populates items/total/page/pageSize from the response', () => {
    const { fixture, component, unbuildOrdersSpy } = configure({
      listResult: { items: [order()], total: 1, page: 1, pageSize: 20 },
    });
    fixture.detectChanges();

    expect(unbuildOrdersSpy.list).toHaveBeenCalledWith({
      search: undefined,
      status: undefined,
      page: 1,
      pageSize: 20,
    });
    expect(component.items.length).toBe(1);
    expect(component.total).toBe(1);
    expect(component.loading).toBe(false);
  });

  it('resets to page 1 when searching', () => {
    const { fixture, component, unbuildOrdersSpy } = configure();
    fixture.detectChanges();
    component.page = 3;

    component.search = 'UB-0001';
    component.search$();

    expect(component.page).toBe(1);
    expect(unbuildOrdersSpy.list).toHaveBeenCalledWith(
      jasmine.objectContaining({ search: 'UB-0001', page: 1 }),
    );
  });

  it('surfaces a load failure through list-state error, not a thrown exception', () => {
    const { fixture, component, unbuildOrdersSpy } = configure();
    unbuildOrdersSpy.list.and.returnValue(throwError(() => new Error('network down')));
    fixture.detectChanges();

    expect(component.loading).toBe(false);
    expect(component.error).toBeTruthy();
  });

  it('hides permission-gated action affordances when the corresponding permission is denied', () => {
    const { component } = configure({
      permissions: {
        'production-unbuild-orders.complete': false,
        'production-unbuild-orders.cancel': false,
      },
    });
    expect(component.canComplete).toBe(false);
    expect(component.canCancel).toBe(false);
    expect(component.canUpdate).toBe(true);
  });

  it('completing an order replaces it in-place and shows a success toast', () => {
    const { fixture, component, unbuildOrdersSpy, toastSpy } = configure();
    fixture.detectChanges();
    const target = component.items[0];
    unbuildOrdersSpy.complete.and.returnValue(of(order({ status: 'DONE' })));

    component.pendingAction = { type: 'complete', order: target };
    component.runPendingAction({ close: () => undefined });

    expect(unbuildOrdersSpy.complete).toHaveBeenCalledWith(target.id);
    expect(component.items[0].status).toBe('DONE');
    expect(toastSpy.success).toHaveBeenCalled();
  });

  it('on an ambiguous completion failure, reloads the order and reports success only if it actually reached DONE', () => {
    const { fixture, component, unbuildOrdersSpy, toastSpy } = configure();
    fixture.detectChanges();
    const target = component.items[0];
    unbuildOrdersSpy.complete.and.returnValue(throwError(() => new Error('timeout')));
    unbuildOrdersSpy.getById.and.returnValue(of(order({ status: 'DONE' })));

    component.pendingAction = { type: 'complete', order: target };
    component.runPendingAction({ close: () => undefined });

    expect(unbuildOrdersSpy.getById).toHaveBeenCalledWith(target.id);
    expect(component.items[0].status).toBe('DONE');
    expect(toastSpy.success).toHaveBeenCalled();
  });

  it('on an ambiguous completion failure where the reload shows it did NOT complete, reports an error instead', () => {
    const { fixture, component, unbuildOrdersSpy, toastSpy } = configure();
    fixture.detectChanges();
    const target = component.items[0];
    unbuildOrdersSpy.complete.and.returnValue(throwError(() => new Error('timeout')));
    unbuildOrdersSpy.getById.and.returnValue(of(order({ status: 'DRAFT' })));

    component.pendingAction = { type: 'complete', order: target };
    component.runPendingAction({ close: () => undefined });

    expect(toastSpy.error).toHaveBeenCalled();
    expect(toastSpy.success).not.toHaveBeenCalled();
  });
});
