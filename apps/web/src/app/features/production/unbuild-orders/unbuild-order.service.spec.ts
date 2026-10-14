import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { UnbuildOrderService } from './unbuild-order.service';

describe('UnbuildOrderService', () => {
  let service: UnbuildOrderService;
  let httpMock: HttpTestingController;
  const base = `${environment.apiBaseUrl}/v1/production/unbuild-orders`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(UnbuildOrderService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('lists with no query params when none are supplied', () => {
    service.list().subscribe();
    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: { items: [], total: 0, page: 1, pageSize: 20 } });
  });

  it('lists with status, search, and pagination params', () => {
    service.list({ status: 'DRAFT', search: 'UB-0001', page: 2, pageSize: 10 }).subscribe();
    const req = httpMock.expectOne(
      `${base}?status=DRAFT&search=UB-0001&page=2&pageSize=10`,
    );
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: { items: [], total: 0, page: 2, pageSize: 10 } });
  });

  it('gets by id', () => {
    service.getById('ub-1').subscribe();
    const req = httpMock.expectOne(`${base}/ub-1`);
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: {} });
  });

  it('creates an unbuild order', () => {
    const body = {
      productId: 'p1',
      bomId: 'b1',
      quantity: '2',
      unitOfMeasureId: 'u1',
      warehouseId: 'w1',
      unbuildDate: '2026-10-01',
    };
    service.create(body).subscribe();
    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({ success: true, data: {} });
  });

  it('updates an unbuild order', () => {
    service.update('ub-1', { quantity: '3' }).subscribe();
    const req = httpMock.expectOne(`${base}/ub-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ quantity: '3' });
    req.flush({ success: true, data: {} });
  });

  it('completes an unbuild order', () => {
    service.complete('ub-1').subscribe();
    const req = httpMock.expectOne(`${base}/ub-1/complete`);
    expect(req.request.method).toBe('POST');
    req.flush({ success: true, data: {} });
  });

  it('cancels an unbuild order', () => {
    service.cancel('ub-1').subscribe();
    const req = httpMock.expectOne(`${base}/ub-1/cancel`);
    expect(req.request.method).toBe('POST');
    req.flush({ success: true, data: {} });
  });

  it('propagates a 409 conflict (e.g. insufficient stock) as an ApiClientError with the backend message', () => {
    let captured: unknown;
    service.complete('ub-1').subscribe({ error: (err) => (captured = err) });
    const req = httpMock.expectOne(`${base}/ub-1/complete`);
    req.flush(
      { success: false, statusCode: 409, message: 'Insufficient stock' },
      { status: 409, statusText: 'Conflict' },
    );
    expect((captured as { status: number }).status).toBe(409);
    expect((captured as { messages: string[] }).messages).toEqual(['Insufficient stock']);
  });
});
