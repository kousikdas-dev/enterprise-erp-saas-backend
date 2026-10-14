import { RoutingsController } from './routings.controller';
import { RoutingsService } from './routings.service';

describe('RoutingsController', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const id = 'r6666666-aaaa-4aaa-8aaa-r66666666666';

  function createController() {
    const routings = {
      create: jest.fn(),
      list: jest.fn(),
      getById: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      activate: jest.fn(),
      deactivate: jest.fn(),
      createNewVersion: jest.fn(),
    };
    const controller = new RoutingsController(
      routings as unknown as RoutingsService,
    );
    return { controller, routings };
  }

  it('delegates create to the service', async () => {
    const { controller, routings } = createController();
    const dto = { productId: 'p', name: 'Route' } as never;
    await controller.create(actor, dto);
    expect(routings.create).toHaveBeenCalledWith(actor, dto);
  });

  it('delegates list with the optional productId query param', async () => {
    const { controller, routings } = createController();
    await controller.list(actor, 'p1');
    expect(routings.list).toHaveBeenCalledWith(actor, 'p1');
  });

  it('delegates getById', async () => {
    const { controller, routings } = createController();
    await controller.getById(actor, id);
    expect(routings.getById).toHaveBeenCalledWith(actor, id);
  });

  it('delegates update', async () => {
    const { controller, routings } = createController();
    const dto = { name: 'x' } as never;
    await controller.update(actor, id, dto);
    expect(routings.update).toHaveBeenCalledWith(actor, id, dto);
  });

  it('delegates remove', async () => {
    const { controller, routings } = createController();
    await controller.remove(actor, id);
    expect(routings.remove).toHaveBeenCalledWith(actor, id);
  });

  it('delegates activate', async () => {
    const { controller, routings } = createController();
    await controller.activate(actor, id);
    expect(routings.activate).toHaveBeenCalledWith(actor, id);
  });

  it('delegates deactivate', async () => {
    const { controller, routings } = createController();
    await controller.deactivate(actor, id);
    expect(routings.deactivate).toHaveBeenCalledWith(actor, id);
  });

  it('delegates createNewVersion', async () => {
    const { controller, routings } = createController();
    await controller.createNewVersion(actor, id);
    expect(routings.createNewVersion).toHaveBeenCalledWith(actor, id);
  });
});
