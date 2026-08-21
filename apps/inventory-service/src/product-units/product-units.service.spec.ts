import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma-client';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { ProductUnitsService } from './product-units.service';

describe('ProductUnitsService', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const productId = '55555555-aaaa-4aaa-8aaa-555555555555';
  const baseUnitId = '44444444-aaaa-4aaa-8aaa-444444444444';
  const dozenUnitId = '66666666-aaaa-4aaa-8aaa-666666666666';

  function productRow(overrides: Record<string, unknown> = {}) {
    return {
      id: productId,
      tenantId: actor.tenantId,
      unitOfMeasureId: baseUnitId,
      ...overrides,
    };
  }

  function unitRow(overrides: Record<string, unknown> = {}) {
    return {
      id: dozenUnitId,
      tenantId: actor.tenantId,
      code: 'DOZ',
      name: 'Dozen',
      ...overrides,
    };
  }

  function row(overrides: Record<string, unknown> = {}) {
    return {
      id: '77777777-aaaa-4aaa-8aaa-777777777777',
      tenantId: actor.tenantId,
      productId,
      unitOfMeasureId: dozenUnitId,
      conversionFactor: new Prisma.Decimal('12.000000'),
      sellingPrice: new Prisma.Decimal('90.0000'),
      costPrice: new Prisma.Decimal('80.0000'),
      isActive: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      ...overrides,
    };
  }

  function createService() {
    const prisma = {
      product: { findFirst: jest.fn() },
      unitOfMeasure: { findFirst: jest.fn() },
      productUnit: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new ProductUnitsService(
      prisma as never,
      audit as unknown as IdentityAuditClient,
    );
    return { service, prisma, audit };
  }

  function mockRefs(prisma: ReturnType<typeof createService>['prisma']) {
    prisma.product.findFirst.mockResolvedValue(productRow());
    prisma.unitOfMeasure.findFirst.mockResolvedValue(unitRow());
  }

  describe('list', () => {
    it('lists product units scoped to the tenant and product', async () => {
      const { service, prisma } = createService();
      prisma.product.findFirst.mockResolvedValue(productRow());
      prisma.productUnit.findMany.mockResolvedValue([row()]);

      const result = await service.list(actor, productId);

      expect(prisma.productUnit.findMany).toHaveBeenCalledWith({
        where: { tenantId: actor.tenantId, productId },
        orderBy: { createdAt: 'asc' },
      });
      expect(result.items[0].conversionFactor).toBe('12.000000');
      expect(result.items[0].sellingPrice).toBe('90.0000');
      expect(typeof result.items[0].conversionFactor).toBe('string');
    });

    it('returns 404 when the product does not belong to the tenant', async () => {
      const { service, prisma } = createService();
      prisma.product.findFirst.mockResolvedValue(null);
      await expect(service.list(actor, productId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('creates a product unit with decimal fields as strings and audits it', async () => {
      const { service, prisma, audit } = createService();
      mockRefs(prisma);
      prisma.productUnit.create.mockResolvedValue(row());

      const result = await service.create(actor, productId, {
        unitOfMeasureId: dozenUnitId,
        conversionFactor: '12',
        sellingPrice: '90',
        costPrice: '80',
      });

      expect(prisma.productUnit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: actor.tenantId,
          productId,
          unitOfMeasureId: dozenUnitId,
          isActive: true,
        }),
      });
      expect(result.conversionFactor).toBe('12.000000');
      expect(result.sellingPrice).toBe('90.0000');
      expect(result.costPrice).toBe('80.0000');
      expect(typeof result.sellingPrice).toBe('string');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'product_unit.created' }),
      );
    });

    it('rejects a conversionFactor of zero', async () => {
      const { service, prisma } = createService();
      mockRefs(prisma);
      await expect(
        service.create(actor, productId, {
          unitOfMeasureId: dozenUnitId,
          conversionFactor: '0',
          sellingPrice: '90',
          costPrice: '80',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.productUnit.create).not.toHaveBeenCalled();
    });

    it('rejects the product base unit as a product unit', async () => {
      const { service, prisma } = createService();
      prisma.product.findFirst.mockResolvedValue(productRow());
      prisma.unitOfMeasure.findFirst.mockResolvedValue(
        unitRow({ id: baseUnitId }),
      );
      await expect(
        service.create(actor, productId, {
          unitOfMeasureId: baseUnitId,
          conversionFactor: '1',
          sellingPrice: '10',
          costPrice: '5',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.productUnit.create).not.toHaveBeenCalled();
    });

    it('returns 404 when the unit does not belong to the tenant', async () => {
      const { service, prisma } = createService();
      prisma.product.findFirst.mockResolvedValue(productRow());
      prisma.unitOfMeasure.findFirst.mockResolvedValue(null);
      await expect(
        service.create(actor, productId, {
          unitOfMeasureId: dozenUnitId,
          conversionFactor: '12',
          sellingPrice: '90',
          costPrice: '80',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a duplicate product/unit combination', async () => {
      const { service, prisma } = createService();
      mockRefs(prisma);
      prisma.productUnit.create.mockRejectedValue({ code: 'P2002' });
      await expect(
        service.create(actor, productId, {
          unitOfMeasureId: dozenUnitId,
          conversionFactor: '12',
          sellingPrice: '90',
          costPrice: '80',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    it('updates provided fields and audits the change', async () => {
      const { service, prisma, audit } = createService();
      prisma.product.findFirst.mockResolvedValue(productRow());
      prisma.productUnit.findFirst.mockResolvedValue(row());
      prisma.productUnit.update.mockResolvedValue(
        row({ sellingPrice: new Prisma.Decimal('95.0000') }),
      );

      const result = await service.update(actor, productId, row().id, {
        sellingPrice: '95',
      });

      expect(prisma.productUnit.update).toHaveBeenCalledWith({
        where: { id: row().id },
        data: { sellingPrice: new Prisma.Decimal('95') },
      });
      expect(result.sellingPrice).toBe('95.0000');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'product_unit.updated' }),
      );
    });

    it('rejects switching to the product base unit', async () => {
      const { service, prisma } = createService();
      prisma.product.findFirst.mockResolvedValue(productRow());
      prisma.productUnit.findFirst.mockResolvedValue(row());
      prisma.unitOfMeasure.findFirst.mockResolvedValue(
        unitRow({ id: baseUnitId }),
      );

      await expect(
        service.update(actor, productId, row().id, {
          unitOfMeasureId: baseUnitId,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.productUnit.update).not.toHaveBeenCalled();
    });

    it('rejects a conversionFactor of zero on update', async () => {
      const { service, prisma } = createService();
      prisma.product.findFirst.mockResolvedValue(productRow());
      prisma.productUnit.findFirst.mockResolvedValue(row());

      await expect(
        service.update(actor, productId, row().id, {
          conversionFactor: '0',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns 404 for a product unit belonging to another product/tenant', async () => {
      const { service, prisma } = createService();
      prisma.product.findFirst.mockResolvedValue(productRow());
      prisma.productUnit.findFirst.mockResolvedValue(null);

      await expect(
        service.update(actor, productId, row().id, { sellingPrice: '1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a duplicate product/unit combination on update', async () => {
      const { service, prisma } = createService();
      prisma.product.findFirst.mockResolvedValue(productRow());
      prisma.productUnit.findFirst.mockResolvedValue(row());
      prisma.unitOfMeasure.findFirst.mockResolvedValue(unitRow());
      prisma.productUnit.update.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.update(actor, productId, row().id, {
          unitOfMeasureId: dozenUnitId,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws when no fields are provided', async () => {
      const { service, prisma } = createService();
      prisma.product.findFirst.mockResolvedValue(productRow());
      prisma.productUnit.findFirst.mockResolvedValue(row());

      await expect(
        service.update(actor, productId, row().id, {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('remove', () => {
    it('deletes the product unit and audits it', async () => {
      const { service, prisma, audit } = createService();
      prisma.product.findFirst.mockResolvedValue(productRow());
      prisma.productUnit.findFirst.mockResolvedValue(row());

      const result = await service.remove(actor, productId, row().id);

      expect(prisma.productUnit.delete).toHaveBeenCalledWith({
        where: { id: row().id },
      });
      expect(result).toEqual({
        productId,
        id: row().id,
        removed: true,
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'product_unit.deleted' }),
      );
    });

    it('returns 404 for another tenant product unit', async () => {
      const { service, prisma } = createService();
      prisma.product.findFirst.mockResolvedValue(productRow());
      prisma.productUnit.findFirst.mockResolvedValue(null);

      await expect(
        service.remove(actor, productId, row().id),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.productUnit.delete).not.toHaveBeenCalled();
    });

    it('returns 404 when the product does not belong to the tenant', async () => {
      const { service, prisma } = createService();
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(
        service.remove(actor, productId, row().id),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.productUnit.findFirst).not.toHaveBeenCalled();
      expect(prisma.productUnit.delete).not.toHaveBeenCalled();
    });
  });
});
