import { ConflictException } from '@nestjs/common';
import { Request } from 'express';
import { ProductionForwardService } from './production-forward.service';
import { UnbuildOrdersController } from './unbuild-orders.controller';

describe('UnbuildOrdersController', () => {
  const user = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const orderId = 'ub111111-aaaa-4aaa-8aaa-ub1111111111';
  const productId = 'p1111111-aaaa-4aaa-8aaa-p11111111111';
  const bomId = 'bom11111-aaaa-4aaa-8aaa-bom111111111';
  const unitId = 'u3333333-aaaa-4aaa-8aaa-u33333333333';
  const warehouseId = 'w1111111-aaaa-4aaa-8aaa-w11111111111';

  function createController() {
    const forward = jest.fn().mockResolvedValue({});
    const production = { forward } as unknown as ProductionForwardService;
    return { controller: new UnbuildOrdersController(production), forward };
  }

  function fakeRequest(): Request {
    return {
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest' },
    } as unknown as Request;
  }

  it('forwards POST create to production-service', async () => {
    const { controller, forward } = createController();
    const dto = {
      productId,
      bomId,
      quantity: '2',
      unitOfMeasureId: unitId,
      warehouseId,
      unbuildDate: '2026-10-01',
    };

    await controller.create(user, dto as never, fakeRequest());

    expect(forward).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/api/v1/unbuild-orders',
        user,
        body: dto,
      }),
    );
  });

  it('forwards GET list with status, search, and pagination filters', async () => {
    const { controller, forward } = createController();

    await controller.list(user, 'DRAFT', 'UB-0001', '2', '25');

    expect(forward).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/api/v1/unbuild-orders',
        user,
        query: { status: 'DRAFT', search: 'UB-0001', page: '2', pageSize: '25' },
      }),
    );
  });

  it('forwards GET list with no query when no filters are supplied', async () => {
    const { controller, forward } = createController();

    await controller.list(user);

    expect(forward).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/api/v1/unbuild-orders',
        user,
        query: undefined,
      }),
    );
  });

  it('forwards GET by id', async () => {
    const { controller, forward } = createController();

    await controller.getById(user, orderId);

    expect(forward).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: `/api/v1/unbuild-orders/${orderId}`,
        user,
      }),
    );
  });

  it('forwards PATCH update', async () => {
    const { controller, forward } = createController();
    const dto = { quantity: '3', notes: 'revised' };

    await controller.update(user, orderId, dto as never, fakeRequest());

    expect(forward).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PATCH',
        path: `/api/v1/unbuild-orders/${orderId}`,
        user,
        body: dto,
      }),
    );
  });

  it('forwards POST complete', async () => {
    const { controller, forward } = createController();

    await controller.complete(user, orderId, fakeRequest());

    expect(forward).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: `/api/v1/unbuild-orders/${orderId}/complete`,
        user,
      }),
    );
  });

  it('forwards POST cancel', async () => {
    const { controller, forward } = createController();

    await controller.cancel(user, orderId, fakeRequest());

    expect(forward).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: `/api/v1/unbuild-orders/${orderId}/cancel`,
        user,
      }),
    );
  });

  it('propagates a production-service error (e.g. a 409 remapped to ConflictException) unchanged, rather than swallowing or duplicating it', async () => {
    const { controller, forward } = createController();
    forward.mockRejectedValue(new ConflictException('Only a DRAFT unbuild order can be cancelled'));

    await expect(controller.cancel(user, orderId, fakeRequest())).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
