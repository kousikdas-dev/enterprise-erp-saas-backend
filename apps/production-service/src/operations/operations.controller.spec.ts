import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

describe('OperationsController', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const id = 'op111111-aaaa-4aaa-8aaa-op1111111111';

  function createController() {
    const operations = {
      create: jest.fn(),
      list: jest.fn(),
      getById: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      activate: jest.fn(),
      deactivate: jest.fn(),
    };
    const controller = new OperationsController(
      operations as unknown as OperationsService,
    );
    return { controller, operations };
  }

  it('delegates create to the service', async () => {
    const { controller, operations } = createController();
    const dto = { code: 'CUT', name: 'Cutting' } as never;
    await controller.create(actor, dto);
    expect(operations.create).toHaveBeenCalledWith(actor, dto);
  });

  it('delegates list to the service', async () => {
    const { controller, operations } = createController();
    await controller.list(actor);
    expect(operations.list).toHaveBeenCalledWith(actor);
  });

  it('delegates getById to the service', async () => {
    const { controller, operations } = createController();
    await controller.getById(actor, id);
    expect(operations.getById).toHaveBeenCalledWith(actor, id);
  });

  it('delegates update to the service', async () => {
    const { controller, operations } = createController();
    const dto = { name: 'Cutting v2' } as never;
    await controller.update(actor, id, dto);
    expect(operations.update).toHaveBeenCalledWith(actor, id, dto);
  });

  it('delegates remove to the service', async () => {
    const { controller, operations } = createController();
    await controller.remove(actor, id);
    expect(operations.remove).toHaveBeenCalledWith(actor, id);
  });

  it('delegates activate to the service', async () => {
    const { controller, operations } = createController();
    await controller.activate(actor, id);
    expect(operations.activate).toHaveBeenCalledWith(actor, id);
  });

  it('delegates deactivate to the service', async () => {
    const { controller, operations } = createController();
    await controller.deactivate(actor, id);
    expect(operations.deactivate).toHaveBeenCalledWith(actor, id);
  });
});
