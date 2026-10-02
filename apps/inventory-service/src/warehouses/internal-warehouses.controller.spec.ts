import { NotFoundException } from '@nestjs/common';
import { InternalWarehousesController } from './internal-warehouses.controller';
import { WarehousesService } from './warehouses.service';

describe('InternalWarehousesController', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const warehouseId = '55555555-aaaa-4aaa-8aaa-555555555555';

  function warehouse(overrides: Record<string, unknown> = {}) {
    return {
      id: warehouseId,
      tenantId: actor.tenantId,
      code: 'MAIN',
      name: 'Main Warehouse',
      address: null,
      isActive: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      ...overrides,
    };
  }

  function createController() {
    const warehouses = { getById: jest.fn() };
    const controller = new InternalWarehousesController(
      warehouses as unknown as WarehousesService,
    );
    return { controller, warehouses };
  }

  it('returns id/code/name/isActive for a valid tenant-scoped warehouse', async () => {
    const { controller, warehouses } = createController();
    warehouses.getById.mockResolvedValue(warehouse());

    const result = await controller.getInternalDetail(actor, warehouseId);

    expect(result).toEqual({
      id: warehouseId,
      code: 'MAIN',
      name: 'Main Warehouse',
      isActive: true,
    });
    expect(warehouses.getById).toHaveBeenCalledWith(actor, warehouseId);
  });

  it('reflects an inactive warehouse', async () => {
    const { controller, warehouses } = createController();
    warehouses.getById.mockResolvedValue(warehouse({ isActive: false }));

    const result = await controller.getInternalDetail(actor, warehouseId);

    expect(result.isActive).toBe(false);
  });

  it('propagates a 404 when the warehouse does not exist for the calling tenant', async () => {
    const { controller, warehouses } = createController();
    warehouses.getById.mockRejectedValue(
      new NotFoundException('Warehouse not found'),
    );

    await expect(
      controller.getInternalDetail(actor, warehouseId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
