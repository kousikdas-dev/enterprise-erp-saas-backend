import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductType } from '../../generated/prisma-client';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const categoryId = '33333333-aaaa-4aaa-8aaa-333333333333';
  const unitId = '44444444-aaaa-4aaa-8aaa-444444444444';

  function row(overrides: Record<string, unknown> = {}) {
    return {
      id: '55555555-aaaa-4aaa-8aaa-555555555555',
      tenantId: actor.tenantId,
      sku: 'SKU-001',
      name: 'Widget',
      description: null,
      categoryId,
      unitOfMeasureId: unitId,
      sellingPrice: new Prisma.Decimal('19.9900'),
      costPrice: new Prisma.Decimal('10.0000'),
      isActive: true,
      productType: 'GOODS',
      trackInventory: true,
      barcode: null,
      note: null,
      templateProductId: null,
      attributeValues: [],
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      ...overrides,
    };
  }

  const PRODUCT_INCLUDE = {
    attributeValues: {
      include: { attributeValue: { include: { attribute: true } } },
    },
  };

  function createService() {
    const prisma = {
      product: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      productAttributeValue: { deleteMany: jest.fn() },
      attributeValue: { findMany: jest.fn().mockResolvedValue([]) },
      category: { findFirst: jest.fn() },
      unitOfMeasure: { findFirst: jest.fn() },
    };
    (prisma as unknown as { $transaction: jest.Mock }).$transaction = jest.fn(
      (fn: (tx: typeof prisma) => unknown) => fn(prisma),
    );
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new ProductsService(
      prisma as never,
      audit as unknown as IdentityAuditClient,
    );
    return { service, prisma, audit };
  }

  function mockRefs(prisma: ReturnType<typeof createService>['prisma']) {
    prisma.category.findFirst.mockResolvedValue({ id: categoryId });
    prisma.unitOfMeasure.findFirst.mockResolvedValue({ id: unitId });
  }

  it('creates a product with decimal prices and product.created audit', async () => {
    const { service, prisma, audit } = createService();
    mockRefs(prisma);
    prisma.product.create.mockResolvedValue(row());

    const result = await service.create(actor, {
      sku: 'sku-001',
      name: 'Widget',
      categoryId,
      unitOfMeasureId: unitId,
      sellingPrice: '19.99',
      costPrice: '10',
    });

    expect(result.sellingPrice).toBe('19.9900');
    expect(typeof result.sellingPrice).toBe('string');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'product.created',
        metadata: { sku: 'SKU-001', name: 'Widget' },
      }),
    );
    const metadata = (audit.record as jest.Mock).mock.calls[0][0]
      .metadata as Record<string, unknown>;
    expect(metadata).not.toHaveProperty('password');
    expect(metadata).not.toHaveProperty('accessToken');
  });

  it('rejects a duplicate SKU with a SKU-specific message', async () => {
    const { service, prisma } = createService();
    mockRefs(prisma);
    prisma.product.create.mockRejectedValue({
      code: 'P2002',
      meta: { target: ['tenantId', 'sku'] },
    });
    await expect(
      service.create(actor, {
        sku: 'SKU-001',
        name: 'Widget',
        categoryId,
        unitOfMeasureId: unitId,
        sellingPrice: '1',
        costPrice: '1',
      }),
    ).rejects.toMatchObject({
      message: 'SKU already exists in this tenant',
    });
  });

  it('does not mislabel a non-SKU unique-constraint violation as a SKU conflict', async () => {
    const { service, prisma } = createService();
    mockRefs(prisma);
    prisma.attributeValue.findMany.mockResolvedValue([
      { id: '88888888-aaaa-4aaa-8aaa-888888888888' },
    ]);
    prisma.product.create.mockRejectedValue({
      code: 'P2002',
      meta: { target: ['tenantId', 'productId', 'attributeValueId'] },
    });
    await expect(
      service.create(actor, {
        sku: 'SKU-002',
        name: 'Widget',
        categoryId,
        unitOfMeasureId: unitId,
        sellingPrice: '1',
        costPrice: '1',
        attributeValueIds: ['88888888-aaaa-4aaa-8aaa-888888888888'],
      }),
    ).rejects.toMatchObject({
      message: 'A related record already exists',
    });
  });

  it('lists only the actor tenant', async () => {
    const { service, prisma } = createService();
    prisma.product.findMany.mockResolvedValue([row()]);
    await service.list(actor);
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: { tenantId: actor.tenantId },
      orderBy: { sku: 'asc' },
      include: PRODUCT_INCLUDE,
    });
  });

  it('filters list by templateProductId when provided', async () => {
    const { service, prisma } = createService();
    prisma.product.findMany.mockResolvedValue([]);
    const templateId = '66666666-aaaa-4aaa-8aaa-666666666666';
    await service.list(actor, templateId);
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: actor.tenantId, templateProductId: templateId },
      }),
    );
  });

  it('gets a product in the actor tenant', async () => {
    const { service, prisma } = createService();
    prisma.product.findFirst.mockResolvedValue(row());
    await expect(service.getById(actor, row().id)).resolves.toMatchObject({
      sku: 'SKU-001',
    });
  });

  it('updates a product and writes product.updated', async () => {
    const { service, prisma, audit } = createService();
    prisma.product.findFirst.mockResolvedValue(row());
    prisma.product.update.mockResolvedValue(row({ name: 'Gadget' }));
    await service.update(actor, row().id, { name: 'Gadget' });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'product.updated' }),
    );
  });

  it('returns 404 for another tenant product', async () => {
    const { service, prisma } = createService();
    prisma.product.findFirst.mockResolvedValue(null);
    await expect(service.getById(actor, row().id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  describe('product master fields', () => {
    it('creates a product with default productType and trackInventory when omitted', async () => {
      const { service, prisma } = createService();
      mockRefs(prisma);
      prisma.product.create.mockResolvedValue(row());

      const result = await service.create(actor, {
        sku: 'sku-001',
        name: 'Widget',
        categoryId,
        unitOfMeasureId: unitId,
        sellingPrice: '19.99',
        costPrice: '10',
      });

      expect(prisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            productType: undefined,
            trackInventory: undefined,
          }),
        }),
      );
      expect(result.productType).toBe('GOODS');
      expect(result.trackInventory).toBe(true);
    });

    it('creates a GOODS product with trackInventory explicitly true', async () => {
      const { service, prisma } = createService();
      mockRefs(prisma);
      prisma.product.create.mockResolvedValue(
        row({ productType: 'GOODS', trackInventory: true }),
      );

      const result = await service.create(actor, {
        sku: 'sku-002',
        name: 'Widget',
        categoryId,
        unitOfMeasureId: unitId,
        sellingPrice: '19.99',
        costPrice: '10',
        productType: ProductType.GOODS,
        trackInventory: true,
      });

      expect(prisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            productType: 'GOODS',
            trackInventory: true,
          }),
        }),
      );
      expect(result.productType).toBe('GOODS');
      expect(result.trackInventory).toBe(true);
    });

    it('creates a SERVICE product', async () => {
      const { service, prisma } = createService();
      mockRefs(prisma);
      prisma.product.create.mockResolvedValue(row({ productType: 'SERVICE' }));

      const result = await service.create(actor, {
        sku: 'sku-003',
        name: 'Consulting',
        categoryId,
        unitOfMeasureId: unitId,
        sellingPrice: '100',
        costPrice: '0',
        productType: ProductType.SERVICE,
      });

      expect(prisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ productType: 'SERVICE' }),
        }),
      );
      expect(result.productType).toBe('SERVICE');
    });

    it('creates a COMBO product', async () => {
      const { service, prisma } = createService();
      mockRefs(prisma);
      prisma.product.create.mockResolvedValue(row({ productType: 'COMBO' }));

      const result = await service.create(actor, {
        sku: 'sku-004',
        name: 'Combo Pack',
        categoryId,
        unitOfMeasureId: unitId,
        sellingPrice: '25',
        costPrice: '15',
        productType: ProductType.COMBO,
      });

      expect(prisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ productType: 'COMBO' }),
        }),
      );
      expect(result.productType).toBe('COMBO');
    });

    it('creates a product with barcode and note', async () => {
      const { service, prisma } = createService();
      mockRefs(prisma);
      prisma.product.create.mockResolvedValue(
        row({ barcode: '8901234567890', note: 'Fragile, handle with care' }),
      );

      const result = await service.create(actor, {
        sku: 'sku-005',
        name: 'Widget',
        categoryId,
        unitOfMeasureId: unitId,
        sellingPrice: '19.99',
        costPrice: '10',
        barcode: '8901234567890',
        note: 'Fragile, handle with care',
      });

      expect(prisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            barcode: '8901234567890',
            note: 'Fragile, handle with care',
          }),
        }),
      );
      expect(result.barcode).toBe('8901234567890');
      expect(result.note).toBe('Fragile, handle with care');
    });

    it('updates productType', async () => {
      const { service, prisma } = createService();
      prisma.product.findFirst.mockResolvedValue(row());
      prisma.product.update.mockResolvedValue(row({ productType: 'SERVICE' }));

      const result = await service.update(actor, row().id, {
        productType: ProductType.SERVICE,
      });

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: row().id },
        data: { productType: 'SERVICE' },
        include: PRODUCT_INCLUDE,
      });
      expect(result.productType).toBe('SERVICE');
    });

    it('updates trackInventory', async () => {
      const { service, prisma } = createService();
      prisma.product.findFirst.mockResolvedValue(row());
      prisma.product.update.mockResolvedValue(row({ trackInventory: false }));

      const result = await service.update(actor, row().id, {
        trackInventory: false,
      });

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: row().id },
        data: { trackInventory: false },
        include: PRODUCT_INCLUDE,
      });
      expect(result.trackInventory).toBe(false);
    });

    it('updates barcode and note', async () => {
      const { service, prisma } = createService();
      prisma.product.findFirst.mockResolvedValue(row());
      prisma.product.update.mockResolvedValue(
        row({ barcode: '111222333', note: 'Updated note' }),
      );

      const result = await service.update(actor, row().id, {
        barcode: '111222333',
        note: 'Updated note',
      });

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: row().id },
        data: { barcode: '111222333', note: 'Updated note' },
        include: PRODUCT_INCLUDE,
      });
      expect(result.barcode).toBe('111222333');
      expect(result.note).toBe('Updated note');
    });

    it('returns valid master field defaults for an existing (legacy) product', async () => {
      const { service, prisma } = createService();
      prisma.product.findFirst.mockResolvedValue(row());

      const result = await service.getById(actor, row().id);

      expect(result).toMatchObject({
        productType: 'GOODS',
        trackInventory: true,
        barcode: null,
        note: null,
      });
    });

    it('enforces tenant isolation when updating master fields on another tenant product', async () => {
      const { service, prisma } = createService();
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(
        service.update(actor, row().id, { productType: ProductType.SERVICE }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.product.findFirst).toHaveBeenCalledWith({
        where: { id: row().id, tenantId: actor.tenantId },
        include: PRODUCT_INCLUDE,
      });
    });
  });

  describe('product variants', () => {
    const templateId = '77777777-aaaa-4aaa-8aaa-777777777777';
    const attributeValueId = '88888888-aaaa-4aaa-8aaa-888888888888';

    it('creates a variant with a valid top-level templateProductId', async () => {
      const { service, prisma } = createService();
      mockRefs(prisma);
      prisma.product.findFirst.mockResolvedValue(
        row({ id: templateId, templateProductId: null }),
      );
      prisma.product.create.mockResolvedValue(row({ templateProductId: templateId }));

      const result = await service.create(actor, {
        sku: 'sku-variant',
        name: 'Widget Red',
        categoryId,
        unitOfMeasureId: unitId,
        sellingPrice: '19.99',
        costPrice: '10',
        templateProductId: templateId,
      });

      expect(prisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ templateProductId: templateId }),
        }),
      );
      expect(result.templateProductId).toBe(templateId);
    });

    it('rejects a templateProductId that does not exist for this tenant', async () => {
      const { service, prisma } = createService();
      mockRefs(prisma);
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(
        service.create(actor, {
          sku: 'sku-variant',
          name: 'Widget Red',
          categoryId,
          unitOfMeasureId: unitId,
          sellingPrice: '19.99',
          costPrice: '10',
          templateProductId: templateId,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a templateProductId that is itself already a variant (no nested variants)', async () => {
      const { service, prisma } = createService();
      mockRefs(prisma);
      prisma.product.findFirst.mockResolvedValue(
        row({ id: templateId, templateProductId: '99999999-aaaa-4aaa-8aaa-999999999999' }),
      );

      await expect(
        service.create(actor, {
          sku: 'sku-variant',
          name: 'Widget Red',
          categoryId,
          unitOfMeasureId: unitId,
          sellingPrice: '19.99',
          costPrice: '10',
          templateProductId: templateId,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a product being set as a variant of itself', async () => {
      const { service, prisma } = createService();
      prisma.product.findFirst.mockResolvedValue(row());

      await expect(
        service.update(actor, row().id, { templateProductId: row().id }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects making a product-with-children itself a variant (hidden two-level chain, template-side direction)', async () => {
      const { service, prisma } = createService();
      const productId = row().id;
      prisma.product.findFirst.mockImplementation(
        ({ where }: { where: { id: string } }) => {
          if (where.id === productId) return Promise.resolve(row({ id: productId }));
          if (where.id === templateId)
            return Promise.resolve({ templateProductId: null });
          return Promise.resolve(null);
        },
      );
      // This product already has a variant pointing at it.
      prisma.product.count.mockResolvedValue(1);

      await expect(
        service.update(actor, productId, { templateProductId: templateId }),
      ).rejects.toMatchObject({
        message: 'This product already has variants and cannot itself become a variant',
      });
      expect(prisma.product.count).toHaveBeenCalledWith({
        where: { tenantId: actor.tenantId, templateProductId: productId },
      });
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('rejects a candidate template whose own chain leads back to the product being updated (cycle, variant-side direction)', async () => {
      const { service, prisma } = createService();
      const productId = row().id;
      const candidateId = templateId;
      prisma.product.findFirst.mockImplementation(
        ({ where }: { where: { id: string } }) => {
          if (where.id === productId) return Promise.resolve(row({ id: productId }));
          if (where.id === candidateId)
            return Promise.resolve({ templateProductId: productId });
          return Promise.resolve(null);
        },
      );

      await expect(
        service.update(actor, productId, { templateProductId: candidateId }),
      ).rejects.toMatchObject({
        message: 'This would create a circular variant relationship',
      });
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('clears templateProductId when explicitly set to null, without ever querying Prisma with id: null', async () => {
      const { service, prisma } = createService();
      prisma.product.findFirst.mockResolvedValue(
        row({ templateProductId: templateId }),
      );
      prisma.product.update.mockResolvedValue(row({ templateProductId: null }));

      const result = await service.update(actor, row().id, {
        templateProductId: null,
      });

      // Only the initial requireProduct() lookup — no template-chain lookup
      // is ever attempted for an explicit `null`.
      expect(prisma.product.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ templateProductId: null }),
        }),
      );
      expect(result.templateProductId).toBeNull();
    });

    it('creates a product tagged with attribute values', async () => {
      const { service, prisma } = createService();
      mockRefs(prisma);
      prisma.attributeValue.findMany.mockResolvedValue([{ id: attributeValueId }]);
      prisma.product.create.mockResolvedValue(
        row({
          attributeValues: [
            {
              attributeValue: {
                id: attributeValueId,
                attributeId: 'attr-1',
                value: 'Red',
                attribute: { name: 'Color' },
              },
            },
          ],
        }),
      );

      const result = await service.create(actor, {
        sku: 'sku-variant',
        name: 'Widget Red',
        categoryId,
        unitOfMeasureId: unitId,
        sellingPrice: '19.99',
        costPrice: '10',
        attributeValueIds: [attributeValueId],
      });

      expect(prisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            attributeValues: { create: [{ tenantId: actor.tenantId, attributeValueId }] },
          }),
        }),
      );
      expect(result.attributeValues).toEqual([
        { id: attributeValueId, attributeId: 'attr-1', attributeName: 'Color', value: 'Red' },
      ]);
    });

    it('rejects an attributeValueId that does not exist for this tenant', async () => {
      const { service, prisma } = createService();
      mockRefs(prisma);
      prisma.attributeValue.findMany.mockResolvedValue([]);

      await expect(
        service.create(actor, {
          sku: 'sku-variant',
          name: 'Widget Red',
          categoryId,
          unitOfMeasureId: unitId,
          sellingPrice: '19.99',
          costPrice: '10',
          attributeValueIds: [attributeValueId],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('replaces attribute values on update inside a transaction', async () => {
      const { service, prisma } = createService();
      prisma.product.findFirst.mockResolvedValue(row());
      prisma.attributeValue.findMany.mockResolvedValue([{ id: attributeValueId }]);
      prisma.product.update.mockResolvedValue(row());

      await service.update(actor, row().id, { attributeValueIds: [attributeValueId] });

      expect(prisma.productAttributeValue.deleteMany).toHaveBeenCalledWith({
        where: { productId: row().id },
      });
      expect(prisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            attributeValues: { create: [{ tenantId: actor.tenantId, attributeValueId }] },
          }),
        }),
      );
    });
  });

  describe('clearing nullable fields (PATCH contract: absent=unchanged, null=clear, value=set)', () => {
    it('clears description when explicitly set to null', async () => {
      const { service, prisma } = createService();
      prisma.product.findFirst.mockResolvedValue(
        row({ description: 'Original description' }),
      );
      prisma.product.update.mockResolvedValue(row({ description: null }));

      const result = await service.update(actor, row().id, { description: null });

      expect(prisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ description: null }),
        }),
      );
      expect(result.description).toBeNull();
    });

    it('leaves description unchanged when the key is omitted', async () => {
      const { service, prisma } = createService();
      prisma.product.findFirst.mockResolvedValue(
        row({ description: 'Original description' }),
      );
      prisma.product.update.mockResolvedValue(row({ description: 'Original description', name: 'Gadget' }));

      await service.update(actor, row().id, { name: 'Gadget' });

      expect(prisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { name: 'Gadget' },
        }),
      );
    });

    it('clears barcode when explicitly set to null', async () => {
      const { service, prisma } = createService();
      prisma.product.findFirst.mockResolvedValue(row({ barcode: '1234567890' }));
      prisma.product.update.mockResolvedValue(row({ barcode: null }));

      const result = await service.update(actor, row().id, { barcode: null });

      expect(prisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ barcode: null }),
        }),
      );
      expect(result.barcode).toBeNull();
    });

    it('clears note when explicitly set to null', async () => {
      const { service, prisma } = createService();
      prisma.product.findFirst.mockResolvedValue(row({ note: 'Fragile' }));
      prisma.product.update.mockResolvedValue(row({ note: null }));

      const result = await service.update(actor, row().id, { note: null });

      expect(prisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ note: null }),
        }),
      );
      expect(result.note).toBeNull();
    });
  });

  describe('tenant isolation on variant assignment checks', () => {
    it('scopes the "already has variants" check to the actor tenant', async () => {
      const { service, prisma } = createService();
      const productId = row().id;
      const templateId = '77777777-aaaa-4aaa-8aaa-777777777777';
      prisma.product.findFirst.mockImplementation(
        ({ where }: { where: { id: string } }) => {
          if (where.id === productId) return Promise.resolve(row({ id: productId }));
          if (where.id === templateId)
            return Promise.resolve({ templateProductId: null });
          return Promise.resolve(null);
        },
      );
      prisma.product.count.mockResolvedValue(0);
      prisma.product.update.mockResolvedValue(
        row({ id: productId, templateProductId: templateId }),
      );

      await service.update(actor, productId, { templateProductId: templateId });

      expect(prisma.product.count).toHaveBeenCalledWith({
        where: { tenantId: actor.tenantId, templateProductId: productId },
      });
      for (const call of prisma.product.findFirst.mock.calls) {
        expect((call[0] as { where: { tenantId: string } }).where.tenantId).toBe(
          actor.tenantId,
        );
      }
    });
  });
});
