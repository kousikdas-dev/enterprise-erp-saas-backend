import { ProductionOrdersController } from './production-orders.controller';
import { ProductionOrdersService } from './production-orders.service';

describe('ProductionOrdersController', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const id = 'mo111111-aaaa-4aaa-8aaa-mo1111111111';

  function createController() {
    const productionOrders = {
      create: jest.fn(),
      list: jest.fn(),
      getById: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      plan: jest.fn(),
      release: jest.fn(),
      start: jest.fn(),
      complete: jest.fn(),
      cancel: jest.fn(),
      close: jest.fn(),
    };
    const controller = new ProductionOrdersController(
      productionOrders as unknown as ProductionOrdersService,
    );
    return { controller, productionOrders };
  }

  it('delegates create to the service', async () => {
    const { controller, productionOrders } = createController();
    const dto = { productId: 'p', bomId: 'b' } as never;
    await controller.create(actor, dto);
    expect(productionOrders.create).toHaveBeenCalledWith(actor, dto);
  });

  it('delegates list with parsed query params', async () => {
    const { controller, productionOrders } = createController();
    await controller.list(actor, 'yarn', 'PLANNED', '2026-01-01', '2026-12-31', '2', '10');
    expect(productionOrders.list).toHaveBeenCalledWith(actor, {
      search: 'yarn',
      status: 'PLANNED',
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      page: 2,
      pageSize: 10,
    });
  });

  it('omits page/pageSize when not numeric', async () => {
    const { controller, productionOrders } = createController();
    await controller.list(actor, undefined, undefined, undefined, undefined, 'abc', '-5');
    expect(productionOrders.list).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ page: undefined, pageSize: undefined }),
    );
  });

  it('delegates getById', async () => {
    const { controller, productionOrders } = createController();
    await controller.getById(actor, id);
    expect(productionOrders.getById).toHaveBeenCalledWith(actor, id);
  });

  it('delegates update', async () => {
    const { controller, productionOrders } = createController();
    const dto = { notes: 'x' } as never;
    await controller.update(actor, id, dto);
    expect(productionOrders.update).toHaveBeenCalledWith(actor, id, dto);
  });

  it('delegates remove', async () => {
    const { controller, productionOrders } = createController();
    await controller.remove(actor, id);
    expect(productionOrders.remove).toHaveBeenCalledWith(actor, id);
  });

  it('delegates plan', async () => {
    const { controller, productionOrders } = createController();
    await controller.plan(actor, id);
    expect(productionOrders.plan).toHaveBeenCalledWith(actor, id);
  });

  it('delegates release', async () => {
    const { controller, productionOrders } = createController();
    await controller.release(actor, id);
    expect(productionOrders.release).toHaveBeenCalledWith(actor, id);
  });

  it('delegates start', async () => {
    const { controller, productionOrders } = createController();
    await controller.start(actor, id);
    expect(productionOrders.start).toHaveBeenCalledWith(actor, id);
  });

  it('delegates complete', async () => {
    const { controller, productionOrders } = createController();
    await controller.complete(actor, id);
    expect(productionOrders.complete).toHaveBeenCalledWith(actor, id);
  });

  it('delegates cancel', async () => {
    const { controller, productionOrders } = createController();
    await controller.cancel(actor, id);
    expect(productionOrders.cancel).toHaveBeenCalledWith(actor, id);
  });

  it('delegates close', async () => {
    const { controller, productionOrders } = createController();
    await controller.close(actor, id);
    expect(productionOrders.close).toHaveBeenCalledWith(actor, id);
  });
});
