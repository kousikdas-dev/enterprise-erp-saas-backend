import { BillOfMaterialsController } from './bill-of-materials.controller';
import { BillOfMaterialsService } from './bill-of-materials.service';

describe('BillOfMaterialsController', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const id = 'bom11111-aaaa-4aaa-8aaa-bom111111111';

  function createController() {
    const boms = {
      create: jest.fn(),
      list: jest.fn(),
      getById: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      activate: jest.fn(),
      deactivate: jest.fn(),
      createNewVersion: jest.fn(),
    };
    const controller = new BillOfMaterialsController(
      boms as unknown as BillOfMaterialsService,
    );
    return { controller, boms };
  }

  it('delegates create to the service', async () => {
    const { controller, boms } = createController();
    const dto = { parentProductId: 'p', items: [] } as never;
    await controller.create(actor, dto);
    expect(boms.create).toHaveBeenCalledWith(actor, dto);
  });

  it('delegates list with the optional parentProductId query param', async () => {
    const { controller, boms } = createController();
    await controller.list(actor, 'p1');
    expect(boms.list).toHaveBeenCalledWith(actor, 'p1');
  });

  it('delegates getById', async () => {
    const { controller, boms } = createController();
    await controller.getById(actor, id);
    expect(boms.getById).toHaveBeenCalledWith(actor, id);
  });

  it('delegates update', async () => {
    const { controller, boms } = createController();
    const dto = { notes: 'x' } as never;
    await controller.update(actor, id, dto);
    expect(boms.update).toHaveBeenCalledWith(actor, id, dto);
  });

  it('delegates remove', async () => {
    const { controller, boms } = createController();
    await controller.remove(actor, id);
    expect(boms.remove).toHaveBeenCalledWith(actor, id);
  });

  it('delegates activate', async () => {
    const { controller, boms } = createController();
    await controller.activate(actor, id);
    expect(boms.activate).toHaveBeenCalledWith(actor, id);
  });

  it('delegates deactivate', async () => {
    const { controller, boms } = createController();
    await controller.deactivate(actor, id);
    expect(boms.deactivate).toHaveBeenCalledWith(actor, id);
  });

  it('delegates createNewVersion', async () => {
    const { controller, boms } = createController();
    await controller.createNewVersion(actor, id);
    expect(boms.createNewVersion).toHaveBeenCalledWith(actor, id);
  });
});
