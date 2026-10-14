import { Request } from 'express';
import { InventoryForwardService } from './inventory-forward.service';
import { ProductsController } from './products.controller';

describe('ProductsController', () => {
  const user = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const productId = '55555555-aaaa-4aaa-8aaa-555555555555';
  const categoryId = '33333333-aaaa-4aaa-8aaa-333333333333';
  const unitId = '44444444-aaaa-4aaa-8aaa-444444444444';
  const templateId = '77777777-aaaa-4aaa-8aaa-777777777777';

  function createController() {
    const forward = jest.fn().mockResolvedValue({});
    const inventory = { forward } as unknown as InventoryForwardService;
    return { controller: new ProductsController(inventory), forward };
  }

  function fakeRequest(): Request {
    return {
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest' },
    } as unknown as Request;
  }

  it('forwards POST create with productType, trackInventory, barcode, and note to the inventory service', async () => {
    const { controller, forward } = createController();
    const dto = {
      sku: 'SKU-001',
      name: 'Widget',
      categoryId,
      unitOfMeasureId: unitId,
      sellingPrice: '19.9900',
      costPrice: '10.0000',
      productType: 'SERVICE',
      trackInventory: false,
      barcode: '1234567890',
      note: 'Fragile',
    };

    await controller.create(user, dto as never, fakeRequest());

    expect(forward).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/api/v1/products',
        user,
        body: dto,
      }),
    );
  });

  it('forwards PATCH update with productType, trackInventory, barcode, and note to the inventory service', async () => {
    const { controller, forward } = createController();
    const dto = {
      productType: 'COMBO',
      trackInventory: true,
      barcode: '0987654321',
      note: 'Updated note',
    };

    await controller.update(user, productId, dto as never, fakeRequest());

    expect(forward).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PATCH',
        path: `/api/v1/products/${productId}`,
        user,
        body: dto,
      }),
    );
  });

  it.each(['description', 'barcode', 'note', 'templateProductId'] as const)(
    'forwards an explicit null for %s unchanged (clear semantics reach the inventory service)',
    async (field) => {
      const { controller, forward } = createController();
      const dto = { [field]: null };

      await controller.update(user, productId, dto as never, fakeRequest());

      expect(forward).toHaveBeenCalledWith(
        expect.objectContaining({ body: { [field]: null } }),
      );
    },
  );

  it('forwards GET list with a templateProductId filter', async () => {
    const { controller, forward } = createController();

    await controller.list(user, templateId);

    expect(forward).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/api/v1/products',
        user,
        query: { templateProductId: templateId },
      }),
    );
  });
});
