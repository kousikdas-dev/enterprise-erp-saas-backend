import { Request } from 'express';
import { InventoryForwardService } from './inventory-forward.service';
import { ProductUnitsController } from './product-units.controller';

describe('ProductUnitsController', () => {
  const user = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const productId = '55555555-aaaa-4aaa-8aaa-555555555555';
  const unitId = '77777777-aaaa-4aaa-8aaa-777777777777';

  function createController() {
    const forward = jest.fn().mockResolvedValue({});
    const inventory = { forward } as unknown as InventoryForwardService;
    return { controller: new ProductUnitsController(inventory), forward };
  }

  function fakeRequest(): Request {
    return {
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest' },
    } as unknown as Request;
  }

  it('forwards GET list to the inventory service', async () => {
    const { controller, forward } = createController();

    await controller.list(user, productId);

    expect(forward).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: `/api/v1/products/${productId}/units`,
        user,
      }),
    );
  });

  it('forwards POST create to the inventory service', async () => {
    const { controller, forward } = createController();
    const dto = {
      unitOfMeasureId: '99999999-aaaa-4aaa-8aaa-999999999999',
      conversionFactor: '12',
      sellingPrice: '90',
      costPrice: '80',
    };

    await controller.create(user, productId, dto, fakeRequest());

    expect(forward).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: `/api/v1/products/${productId}/units`,
        user,
        body: dto,
      }),
    );
  });

  it('forwards PATCH update to the inventory service', async () => {
    const { controller, forward } = createController();
    const dto = { sellingPrice: '95' };

    await controller.update(user, productId, unitId, dto, fakeRequest());

    expect(forward).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PATCH',
        path: `/api/v1/products/${productId}/units/${unitId}`,
        user,
        body: dto,
      }),
    );
  });

  it('forwards DELETE remove to the inventory service', async () => {
    const { controller, forward } = createController();

    await controller.remove(user, productId, unitId, fakeRequest());

    expect(forward).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'DELETE',
        path: `/api/v1/products/${productId}/units/${unitId}`,
        user,
      }),
    );
  });
});
