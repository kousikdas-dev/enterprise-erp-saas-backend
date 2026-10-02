import { WorkCentresController } from './work-centres.controller';
import { WorkCentresService } from './work-centres.service';

describe('WorkCentresController', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const id = 'wc111111-aaaa-4aaa-8aaa-wc1111111111';

  function createController() {
    const workCentres = {
      create: jest.fn(),
      list: jest.fn(),
      getById: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      activate: jest.fn(),
      deactivate: jest.fn(),
    };
    const controller = new WorkCentresController(
      workCentres as unknown as WorkCentresService,
    );
    return { controller, workCentres };
  }

  it('delegates create to the service', async () => {
    const { controller, workCentres } = createController();
    const dto = { code: 'CNC-01', name: 'CNC Machine 01' } as never;
    await controller.create(actor, dto);
    expect(workCentres.create).toHaveBeenCalledWith(actor, dto);
  });

  it('delegates list to the service', async () => {
    const { controller, workCentres } = createController();
    await controller.list(actor);
    expect(workCentres.list).toHaveBeenCalledWith(actor);
  });

  it('delegates getById to the service', async () => {
    const { controller, workCentres } = createController();
    await controller.getById(actor, id);
    expect(workCentres.getById).toHaveBeenCalledWith(actor, id);
  });

  it('delegates update to the service', async () => {
    const { controller, workCentres } = createController();
    const dto = { name: 'CNC Machine 01 v2' } as never;
    await controller.update(actor, id, dto);
    expect(workCentres.update).toHaveBeenCalledWith(actor, id, dto);
  });

  it('delegates remove to the service', async () => {
    const { controller, workCentres } = createController();
    await controller.remove(actor, id);
    expect(workCentres.remove).toHaveBeenCalledWith(actor, id);
  });

  it('delegates activate to the service', async () => {
    const { controller, workCentres } = createController();
    await controller.activate(actor, id);
    expect(workCentres.activate).toHaveBeenCalledWith(actor, id);
  });

  it('delegates deactivate to the service', async () => {
    const { controller, workCentres } = createController();
    await controller.deactivate(actor, id);
    expect(workCentres.deactivate).toHaveBeenCalledWith(actor, id);
  });
});
