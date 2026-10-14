import { ActivatedRoute } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { of, throwError } from 'rxjs';
import { SharedModule } from '../../../shared.module';
import { ListStateComponent } from '../../../shared/list-state/list-state.component';
import { PermissionService } from '../../../core/permissions/permission.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { Product } from '../../inventory/models/inventory.models';
import { ProductService } from '../../inventory/products/product.service';
import { UnitService } from '../../inventory/units/unit.service';
import { WarehouseService } from '../../inventory/warehouses/warehouse.service';
import { Bom, UnbuildOrder } from '../models/production.models';
import { BomService } from '../boms/bom.service';
import { UnbuildOrderDetailComponent } from './unbuild-order-detail.component';
import { UnbuildOrderService } from './unbuild-order.service';

describe('UnbuildOrderDetailComponent', () => {
  const baseUnitId = 'u-base';

  function product(): Product {
    return {
      id: 'p1',
      tenantId: 't1',
      sku: 'TABLE-OAK',
      name: 'Oak Table',
      description: null,
      categoryId: 'c1',
      unitOfMeasureId: baseUnitId,
      sellingPrice: '0',
      costPrice: '0',
      isActive: true,
      productType: 'GOODS',
      trackInventory: true,
      barcode: null,
      note: null,
    } as Product;
  }

  function bom(overrides: Partial<Bom> = {}): Bom {
    return {
      id: 'bom1',
      tenantId: 't1',
      parentProductId: 'p1',
      parentProductSku: 'TABLE-OAK',
      parentProductName: 'Oak Table',
      bomQuantity: '1.000000',
      outputUnitOfMeasureId: baseUnitId,
      outputUomCode: 'PCS',
      outputUomName: 'Piece',
      version: 1,
      status: 'ACTIVE',
      effectiveFrom: null,
      effectiveTo: null,
      notes: null,
      productVariantId: null,
      productVariantSku: null,
      productVariantName: null,
      items: [
        {
          id: 'bi1',
          componentProductId: 'c1',
          componentProductSku: 'LEG-OAK',
          componentProductName: 'Oak Leg',
          quantity: '4.000000',
          unitOfMeasureId: baseUnitId,
          uomCode: 'PCS',
          uomName: 'Piece',
          scrapPercentage: null,
          sequence: 1,
        },
      ],
      operations: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

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
      unitOfMeasureId: baseUnitId,
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
    routeId?: string | null;
    permissions?: Record<string, boolean>;
  } = {}) {
    const unbuildOrdersSpy = {
      getById: jasmine.createSpy('getById').and.returnValue(of(order())),
      create: jasmine.createSpy('create'),
      update: jasmine.createSpy('update'),
      complete: jasmine.createSpy('complete'),
      cancel: jasmine.createSpy('cancel'),
    };
    const bomSpy = { list: jasmine.createSpy('list').and.returnValue(of({ items: [bom()] })) };
    const productSpy = { list: jasmine.createSpy('list').and.returnValue(of({ items: [product()] })) };
    const unitSpy = {
      list: jasmine.createSpy('list').and.returnValue(
        of({ items: [{ id: baseUnitId, code: 'PCS', name: 'Piece' }] }),
      ),
    };
    const warehouseSpy = {
      list: jasmine.createSpy('list').and.returnValue(
        of({ items: [{ id: 'w1', code: 'WH1', name: 'Main Warehouse', isActive: true }] }),
      ),
    };
    const toastSpy = { success: jasmine.createSpy('success'), error: jasmine.createSpy('error') };
    const modalSpy = { open: jasmine.createSpy('open').and.returnValue({}) };
    const permissionValues = {
      'production-unbuild-orders.create': true,
      'production-unbuild-orders.update': true,
      'production-unbuild-orders.complete': true,
      'production-unbuild-orders.cancel': true,
      ...opts.permissions,
    };
    const permissionSpy = {
      has: jasmine.createSpy('has').and.callFake((key: string) => permissionValues[key] ?? true),
    };
    const routeId = opts.routeId === undefined ? 'ub-1' : opts.routeId;

    TestBed.configureTestingModule({
      imports: [SharedModule, ListStateComponent],
      declarations: [UnbuildOrderDetailComponent],
      providers: [
        { provide: UnbuildOrderService, useValue: unbuildOrdersSpy },
        { provide: BomService, useValue: bomSpy },
        { provide: ProductService, useValue: productSpy },
        { provide: UnitService, useValue: unitSpy },
        { provide: WarehouseService, useValue: warehouseSpy },
        { provide: ToastService, useValue: toastSpy },
        { provide: NgbModal, useValue: modalSpy },
        { provide: PermissionService, useValue: permissionSpy },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => routeId } } },
        },
      ],
    });

    const fixture = TestBed.createComponent(UnbuildOrderDetailComponent);
    return { fixture, component: fixture.componentInstance, unbuildOrdersSpy, toastSpy };
  }

  it('treats a missing/"new" route id as a new, editable order', () => {
    const { fixture, component } = configure({ routeId: null });
    fixture.detectChanges();
    expect(component.isNew).toBe(true);
    expect(component.isEditable).toBe(true);
  });

  it('loads an existing order and is editable only while DRAFT', () => {
    const { fixture, component, unbuildOrdersSpy } = configure({ routeId: 'ub-1' });
    unbuildOrdersSpy.getById.and.returnValue(of(order({ status: 'PROCESSING' })));
    fixture.detectChanges();

    expect(component.isNew).toBe(false);
    expect(component.order?.status).toBe('PROCESSING');
    expect(component.isEditable).toBe(false);
  });

  it('rejects an empty required field (bomId) and a non-positive quantity', () => {
    const { fixture, component } = configure({ routeId: null });
    fixture.detectChanges();

    component.form.patchValue({ productId: 'p1', bomId: '', quantity: '0', warehouseId: 'w1', unbuildDate: '2026-10-01' });
    expect(component.form.get('bomId')!.valid).toBe(false);
    expect(component.form.get('quantity')!.valid).toBe(false);

    component.form.patchValue({ bomId: 'bom1', quantity: '2.5' });
    expect(component.form.get('bomId')!.valid).toBe(true);
    expect(component.form.get('quantity')!.valid).toBe(true);
  });

  it('auto-sets the unit of measure to the selected product\'s own base unit, with no alternative offered', () => {
    const { fixture, component } = configure({ routeId: null });
    fixture.detectChanges();

    component.form.get('productId')!.setValue('p1');

    expect(component.form.value.unitOfMeasureId).toBe(baseUnitId);
  });

  it('computes a theoretical component preview from the BOM scale formula (quantity / bom.bomQuantity)', () => {
    const { fixture, component } = configure({ routeId: null });
    fixture.detectChanges();

    component.form.get('productId')!.setValue('p1');
    component.form.get('bomId')!.setValue('bom1');
    component.form.get('quantity')!.setValue('3');

    expect(component.previewItems.length).toBe(1);
    // bomQuantity=1, orderQty=3 -> scale=3; bomItem.quantity=4 -> 12
    expect(Number(component.previewItems[0].quantity)).toBe(12);
  });

  it('only allows Complete/Cancel on a DRAFT order, gated by permission', () => {
    const { fixture, component, unbuildOrdersSpy } = configure({
      routeId: 'ub-1',
      permissions: { 'production-unbuild-orders.cancel': false },
    });
    unbuildOrdersSpy.getById.and.returnValue(of(order({ status: 'DRAFT' })));
    fixture.detectChanges();

    expect(component.canCompleteOrder).toBe(true);
    expect(component.canCancelOrder).toBe(false);

    unbuildOrdersSpy.getById.and.returnValue(of(order({ status: 'DONE' })));
    component.loadOrder('ub-1');
    expect(component.canCompleteOrder).toBe(false);
  });

  it('on a successful completion, refreshes the order from the response', () => {
    const { fixture, component, unbuildOrdersSpy, toastSpy } = configure({ routeId: 'ub-1' });
    fixture.detectChanges();
    unbuildOrdersSpy.complete.and.returnValue(of(order({ status: 'DONE', finishedGoodsMovementId: 'mv-1' })));

    component.pendingAction = 'complete';
    component.runPendingAction({ close: () => undefined });

    expect(component.order?.status).toBe('DONE');
    expect(component.order?.finishedGoodsMovementId).toBe('mv-1');
    expect(toastSpy.success).toHaveBeenCalled();
  });

  it('on an ambiguous completion failure, never claims success or failure without reloading and checking the order', () => {
    const { fixture, component, unbuildOrdersSpy, toastSpy } = configure({ routeId: 'ub-1' });
    fixture.detectChanges();
    unbuildOrdersSpy.complete.and.returnValue(throwError(() => new Error('socket hang up')));
    unbuildOrdersSpy.getById.and.returnValue(of(order({ status: 'DONE' })));

    component.pendingAction = 'complete';
    component.runPendingAction({ close: () => undefined });

    expect(unbuildOrdersSpy.getById).toHaveBeenCalledWith('ub-1');
    expect(component.order?.status).toBe('DONE');
    expect(toastSpy.success).toHaveBeenCalled();
    expect(toastSpy.error).not.toHaveBeenCalled();
  });

  it('disables duplicate submissions while a completion request is pending', () => {
    const { fixture, component, unbuildOrdersSpy } = configure({ routeId: 'ub-1' });
    fixture.detectChanges();
    unbuildOrdersSpy.complete.and.returnValue(of(order({ status: 'DONE' })).pipe());

    component.pendingAction = 'complete';
    component.actionBusy = true;
    component.runPendingAction({ close: () => undefined });

    expect(unbuildOrdersSpy.complete).not.toHaveBeenCalled();
  });
});
