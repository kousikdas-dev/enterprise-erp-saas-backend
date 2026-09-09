import { NotFoundException } from '@nestjs/common';
import { ProductUnitsService } from '../product-units/product-units.service';
import { UnitsService } from '../units/units.service';
import { InternalProductsController } from './internal-products.controller';
import { ProductsService } from './products.service';

describe('InternalProductsController', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const productId = '55555555-aaaa-4aaa-8aaa-555555555555';
  const baseUnitId = '44444444-aaaa-4aaa-8aaa-444444444444';
  const altUnitId = '66666666-aaaa-4aaa-8aaa-666666666666';
  const inactiveAltUnitId = '77777777-aaaa-4aaa-8aaa-777777777777';

  function product(overrides: Record<string, unknown> = {}) {
    return {
      id: productId,
      tenantId: actor.tenantId,
      sku: 'SKU-001',
      name: 'Widget',
      description: null,
      categoryId: '33333333-aaaa-4aaa-8aaa-333333333333',
      unitOfMeasureId: baseUnitId,
      sellingPrice: '19.9900',
      costPrice: '10.0000',
      isActive: true,
      productType: 'GOODS',
      trackInventory: true,
      barcode: null,
      note: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      ...overrides,
    };
  }

  function unit(id: string, code: string, name: string, isActive = true) {
    return {
      id,
      tenantId: actor.tenantId,
      code,
      name,
      isActive,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    };
  }

  function productUnit(overrides: Record<string, unknown> = {}) {
    return {
      id: '88888888-aaaa-4aaa-8aaa-888888888888',
      tenantId: actor.tenantId,
      productId,
      unitOfMeasureId: altUnitId,
      conversionFactor: '12.000000',
      sellingPrice: '90.0000',
      costPrice: '80.0000',
      isActive: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      ...overrides,
    };
  }

  function createController() {
    const products = { getById: jest.fn() };
    const productUnits = { list: jest.fn() };
    const units = { list: jest.fn() };
    const controller = new InternalProductsController(
      products as unknown as ProductsService,
      productUnits as unknown as ProductUnitsService,
      units as unknown as UnitsService,
    );
    return { controller, products, productUnits, units };
  }

  it("returns the product's base UOM", async () => {
    const { controller, products, productUnits, units } = createController();
    products.getById.mockResolvedValue(product());
    productUnits.list.mockResolvedValue({ items: [] });
    units.list.mockResolvedValue({ items: [unit(baseUnitId, 'EA', 'Each')] });

    const result = await controller.uomOptions(actor, productId);

    expect(result.base).toEqual({
      unitOfMeasureId: baseUnitId,
      code: 'EA',
      name: 'Each',
    });
  });

  it('returns only active ProductUnit alternatives', async () => {
    const { controller, products, productUnits, units } = createController();
    products.getById.mockResolvedValue(product());
    productUnits.list.mockResolvedValue({
      items: [
        productUnit({ unitOfMeasureId: altUnitId, isActive: true }),
        productUnit({
          id: '99999999-aaaa-4aaa-8aaa-999999999999',
          unitOfMeasureId: inactiveAltUnitId,
          isActive: false,
        }),
      ],
    });
    units.list.mockResolvedValue({
      items: [
        unit(baseUnitId, 'EA', 'Each'),
        unit(altUnitId, 'BOX', 'Box of 12'),
        unit(inactiveAltUnitId, 'CTN', 'Carton'),
      ],
    });

    const result = await controller.uomOptions(actor, productId);

    expect(result.alternatives).toHaveLength(1);
    expect(result.alternatives[0].unitOfMeasureId).toBe(altUnitId);
  });

  it('returns conversionFactor and sellingPrice as strings', async () => {
    const { controller, products, productUnits, units } = createController();
    products.getById.mockResolvedValue(product());
    productUnits.list.mockResolvedValue({
      items: [
        productUnit({
          unitOfMeasureId: altUnitId,
          conversionFactor: '12.000000',
          sellingPrice: '90.0000',
        }),
      ],
    });
    units.list.mockResolvedValue({
      items: [unit(baseUnitId, 'EA', 'Each'), unit(altUnitId, 'BOX', 'Box of 12')],
    });

    const result = await controller.uomOptions(actor, productId);

    expect(result.alternatives[0].conversionFactor).toBe('12.000000');
    expect(typeof result.alternatives[0].conversionFactor).toBe('string');
    expect(result.alternatives[0].sellingPrice).toBe('90.0000');
    expect(typeof result.alternatives[0].sellingPrice).toBe('string');
  });

  it('resolves UOM code/name for each alternative', async () => {
    const { controller, products, productUnits, units } = createController();
    products.getById.mockResolvedValue(product());
    productUnits.list.mockResolvedValue({
      items: [productUnit({ unitOfMeasureId: altUnitId })],
    });
    units.list.mockResolvedValue({
      items: [unit(baseUnitId, 'EA', 'Each'), unit(altUnitId, 'BOX', 'Box of 12')],
    });

    const result = await controller.uomOptions(actor, productId);

    expect(result.alternatives[0]).toMatchObject({
      unitOfMeasureId: altUnitId,
      code: 'BOX',
      name: 'Box of 12',
    });
  });

  it('propagates a 404 when the product does not exist for the calling tenant', async () => {
    const { controller, products } = createController();
    products.getById.mockRejectedValue(
      new NotFoundException('Product not found'),
    );

    await expect(
      controller.uomOptions(actor, productId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws a 404 if the base unit cannot be resolved', async () => {
    const { controller, products, productUnits, units } = createController();
    products.getById.mockResolvedValue(product());
    productUnits.list.mockResolvedValue({ items: [] });
    units.list.mockResolvedValue({ items: [] });

    await expect(
      controller.uomOptions(actor, productId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws a 404 if an alternative unit cannot be resolved', async () => {
    const { controller, products, productUnits, units } = createController();
    products.getById.mockResolvedValue(product());
    productUnits.list.mockResolvedValue({
      items: [productUnit({ unitOfMeasureId: altUnitId })],
    });
    units.list.mockResolvedValue({ items: [unit(baseUnitId, 'EA', 'Each')] });

    await expect(
      controller.uomOptions(actor, productId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('passes the current ActorContext to every underlying tenant-scoped service call', async () => {
    const { controller, products, productUnits, units } = createController();
    products.getById.mockResolvedValue(product());
    productUnits.list.mockResolvedValue({ items: [] });
    units.list.mockResolvedValue({ items: [unit(baseUnitId, 'EA', 'Each')] });

    await controller.uomOptions(actor, productId);

    expect(products.getById).toHaveBeenCalledWith(actor, productId);
    expect(productUnits.list).toHaveBeenCalledWith(actor, productId);
    expect(units.list).toHaveBeenCalledWith(actor);
  });
});
