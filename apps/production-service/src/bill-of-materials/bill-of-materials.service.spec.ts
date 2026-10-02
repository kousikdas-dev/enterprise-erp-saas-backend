import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma-client';
import { BillOfMaterialsService } from './bill-of-materials.service';

describe('BillOfMaterialsService', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const otherTenant = 'bbbbbbbb-aaaa-4aaa-8aaa-bbbbbbbbbbbb';

  const parentProductId = 'p1111111-aaaa-4aaa-8aaa-p11111111111';
  const componentProductId = 'c2222222-aaaa-4aaa-8aaa-c22222222222';
  const baseUnitId = 'u3333333-aaaa-4aaa-8aaa-u33333333333';
  const altUnitId = 'u4444444-aaaa-4aaa-8aaa-u44444444444';

  function productDetail(
    overrides: Record<string, unknown> = {},
  ) {
    return {
      id: componentProductId,
      sku: 'COTTON',
      name: 'Raw Cotton',
      isActive: true,
      trackInventory: true,
      productType: 'GOODS',
      categoryId: 'cat11111-aaaa-4aaa-8aaa-cat111111111',
      unitOfMeasureId: baseUnitId,
      base: { unitOfMeasureId: baseUnitId, code: 'KG', name: 'Kilogram' },
      alternatives: [
        {
          unitOfMeasureId: altUnitId,
          code: 'G',
          name: 'Gram',
          conversionFactor: '1000.000000',
          sellingPrice: '0.5000',
        },
      ],
      ...overrides,
    };
  }

  function bomItemRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'item1111-aaaa-4aaa-8aaa-item111111111',
      tenantId: actor.tenantId,
      bomId: 'bom11111-aaaa-4aaa-8aaa-bom111111111',
      componentProductId,
      componentProductSku: 'COTTON',
      componentProductName: 'Raw Cotton',
      quantity: new Prisma.Decimal('1.050000'),
      unitOfMeasureId: baseUnitId,
      uomCode: 'KG',
      uomName: 'Kilogram',
      scrapPercentage: null,
      sequence: 1,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      ...overrides,
    };
  }

  function bomRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'bom11111-aaaa-4aaa-8aaa-bom111111111',
      tenantId: actor.tenantId,
      parentProductId,
      parentProductSku: 'YARN-40S',
      parentProductName: 'Cotton Yarn 40s',
      bomQuantity: new Prisma.Decimal('100.000000'),
      outputUnitOfMeasureId: baseUnitId,
      outputUomCode: 'KG',
      outputUomName: 'Kilogram',
      version: 1,
      status: 'DRAFT',
      effectiveFrom: null,
      effectiveTo: null,
      notes: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      items: [bomItemRow()],
      ...overrides,
    };
  }

  function createDto(overrides: Record<string, unknown> = {}) {
    return {
      parentProductId,
      bomQuantity: '100',
      outputUnitOfMeasureId: baseUnitId,
      items: [
        {
          componentProductId,
          quantity: '1.05',
          unitOfMeasureId: baseUnitId,
          sequence: 1,
        },
      ],
      ...overrides,
    };
  }

  function basePrisma(overrides: Record<string, unknown> = {}) {
    const prisma = {
      bom: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        delete: jest.fn(),
      },
      bomItem: {
        deleteMany: jest.fn(),
      },
      ...overrides,
    };
    (prisma as unknown as { $transaction: jest.Mock }).$transaction = jest.fn(
      (fn: (tx: typeof prisma) => unknown) => fn(prisma),
    );
    return prisma;
  }

  function defaultInventory(overrides: Record<string, unknown> = {}) {
    return {
      getProductDetail: jest.fn(async (_actor: unknown, id: string) => {
        if (id === parentProductId) {
          return productDetail({
            id: parentProductId,
            sku: 'YARN-40S',
            name: 'Cotton Yarn 40s',
          });
        }
        return productDetail({ id });
      }),
      ...overrides,
    };
  }

  function service(
    prisma = basePrisma(),
    inventory = defaultInventory(),
  ) {
    return {
      svc: new BillOfMaterialsService(
        prisma as never,
        inventory as never,
      ),
      prisma,
      inventory,
    };
  }

  describe('create', () => {
    it('creates a version-1 DRAFT BOM, snapshotting parent + component detail', async () => {
      const prisma = basePrisma();
      prisma.bom.findFirst.mockResolvedValue(null);
      prisma.bom.create.mockResolvedValue(bomRow());
      const { svc } = service(prisma);

      const result = await svc.create(actor, createDto());

      expect(prisma.bom.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: actor.tenantId,
            parentProductId,
            parentProductSku: 'YARN-40S',
            version: 1,
            status: 'DRAFT',
            outputUnitOfMeasureId: baseUnitId,
            outputUomCode: 'KG',
            outputUomName: 'Kilogram',
          }),
        }),
      );
      expect(result.bomQuantity).toBe('100.000000');
      expect(result.outputUomCode).toBe('KG');
      expect(result.items[0]).toMatchObject({
        componentProductId,
        componentProductSku: 'COTTON',
        quantity: '1.050000',
      });
    });

    it('accepts a decimal bomQuantity with up to 6 decimal places', async () => {
      const prisma = basePrisma();
      prisma.bom.findFirst.mockResolvedValue(null);
      prisma.bom.create.mockResolvedValue(
        bomRow({ bomQuantity: new Prisma.Decimal('0.500000') }),
      );
      const { svc } = service(prisma);

      const result = await svc.create(actor, createDto({ bomQuantity: '0.5' }));

      const createCall = prisma.bom.create.mock.calls[0][0] as {
        data: { bomQuantity: Prisma.Decimal };
      };
      expect(createCall.data.bomQuantity.toString()).toBe('0.5');
      expect(result.bomQuantity).toBe('0.500000');
    });

    it('rejects a bomQuantity of 0', async () => {
      const { svc } = service();

      await expect(
        svc.create(actor, createDto({ bomQuantity: '0' })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a negative bomQuantity', async () => {
      const { svc } = service();

      await expect(
        svc.create(actor, createDto({ bomQuantity: '-1' })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a missing bomQuantity', async () => {
      const { svc } = service();

      await expect(
        svc.create(actor, createDto({ bomQuantity: undefined })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an outputUnitOfMeasureId that is neither the parent base unit nor an active alternative', async () => {
      const { svc } = service();
      const unknownUnitId = 'u9999999-aaaa-4aaa-8aaa-u99999999999';

      await expect(
        svc.create(actor, createDto({ outputUnitOfMeasureId: unknownUnitId })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts the parent product base UOM as the output UOM', async () => {
      const prisma = basePrisma();
      prisma.bom.findFirst.mockResolvedValue(null);
      prisma.bom.create.mockResolvedValue(bomRow());
      const { svc } = service(prisma);

      await svc.create(actor, createDto({ outputUnitOfMeasureId: baseUnitId }));

      expect(prisma.bom.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            outputUnitOfMeasureId: baseUnitId,
            outputUomCode: 'KG',
            outputUomName: 'Kilogram',
          }),
        }),
      );
    });

    it('accepts an active alternative product UOM as the output UOM', async () => {
      const prisma = basePrisma();
      prisma.bom.findFirst.mockResolvedValue(null);
      prisma.bom.create.mockResolvedValue(bomRow());
      const { svc } = service(prisma);

      await svc.create(actor, createDto({ outputUnitOfMeasureId: altUnitId }));

      expect(prisma.bom.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            outputUnitOfMeasureId: altUnitId,
            outputUomCode: 'G',
            outputUomName: 'Gram',
          }),
        }),
      );
    });

    it('auto-increments the version for a parent product that already has a BOM', async () => {
      const prisma = basePrisma();
      prisma.bom.findFirst.mockResolvedValue(bomRow({ version: 1 }));
      prisma.bom.create.mockResolvedValue(bomRow({ version: 2 }));
      const { svc } = service(prisma);

      await svc.create(actor, createDto());

      expect(prisma.bom.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ version: 2 }),
        }),
      );
    });

    it('retries version allocation once on a unique-constraint race, then succeeds', async () => {
      const prisma = basePrisma();
      prisma.bom.findFirst.mockResolvedValue(null);
      prisma.bom.create
        .mockRejectedValueOnce(Object.assign(new Error('conflict'), { code: 'P2002' }))
        .mockResolvedValueOnce(bomRow());
      const { svc } = service(prisma);

      await expect(svc.create(actor, createDto())).resolves.toBeDefined();
      expect(prisma.bom.create).toHaveBeenCalledTimes(2);
    });

    it('rejects when the parent product is not active', async () => {
      const inventory = defaultInventory({
        getProductDetail: jest.fn(async (_a: unknown, id: string) =>
          id === parentProductId
            ? productDetail({ id: parentProductId, isActive: false })
            : productDetail({ id }),
        ),
      });
      const { svc } = service(basePrisma(), inventory);

      await expect(svc.create(actor, createDto())).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects when the parent product is not inventory-tracked', async () => {
      const inventory = defaultInventory({
        getProductDetail: jest.fn(async (_a: unknown, id: string) =>
          id === parentProductId
            ? productDetail({ id: parentProductId, trackInventory: false })
            : productDetail({ id }),
        ),
      });
      const { svc } = service(basePrisma(), inventory);

      await expect(svc.create(actor, createDto())).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects when a component product is inactive', async () => {
      const inventory = defaultInventory({
        getProductDetail: jest.fn(async (_a: unknown, id: string) =>
          id === parentProductId
            ? productDetail({ id: parentProductId })
            : productDetail({ id, isActive: false }),
        ),
      });
      const { svc } = service(basePrisma(), inventory);

      await expect(svc.create(actor, createDto())).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('propagates a 404 when the parent product does not exist for this tenant', async () => {
      const inventory = defaultInventory({
        getProductDetail: jest
          .fn()
          .mockRejectedValue(new NotFoundException('Product not found')),
      });
      const { svc } = service(basePrisma(), inventory);

      await expect(svc.create(actor, createDto())).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects a non-positive quantity', async () => {
      const { svc } = service();

      await expect(
        svc.create(actor, createDto({ items: [{ componentProductId, quantity: '0', unitOfMeasureId: baseUnitId, sequence: 1 }] })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a UOM that is neither the base unit nor an active alternative', async () => {
      const { svc } = service();
      const unknownUnitId = 'u9999999-aaaa-4aaa-8aaa-u99999999999';

      await expect(
        svc.create(
          actor,
          createDto({
            items: [
              {
                componentProductId,
                quantity: '1',
                unitOfMeasureId: unknownUnitId,
                sequence: 1,
              },
            ],
          }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts an alternative (non-base) UOM', async () => {
      const prisma = basePrisma();
      prisma.bom.findFirst.mockResolvedValue(null);
      prisma.bom.create.mockResolvedValue(bomRow());
      const { svc } = service(prisma);

      await svc.create(
        actor,
        createDto({
          items: [
            {
              componentProductId,
              quantity: '1',
              unitOfMeasureId: altUnitId,
              sequence: 1,
            },
          ],
        }),
      );

      expect(prisma.bom.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            items: {
              create: [
                expect.objectContaining({ uomCode: 'G', uomName: 'Gram' }),
              ],
            },
          }),
        }),
      );
    });

    it('rejects duplicate component products within the same payload', async () => {
      const { svc } = service();

      await expect(
        svc.create(
          actor,
          createDto({
            items: [
              { componentProductId, quantity: '1', unitOfMeasureId: baseUnitId, sequence: 1 },
              { componentProductId, quantity: '2', unitOfMeasureId: baseUnitId, sequence: 2 },
            ],
          }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a component that is the same product as the parent (self-reference)', async () => {
      const { svc } = service();

      await expect(
        svc.create(
          actor,
          createDto({
            items: [
              {
                componentProductId: parentProductId,
                quantity: '1',
                unitOfMeasureId: baseUnitId,
                sequence: 1,
              },
            ],
          }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a circular BOM (component product indirectly resolves back to the parent)', async () => {
      // componentProductId already has its own BOM whose component is parentProductId
      // (Fabric's component Yarn already has a BOM that consumes Fabric).
      const prisma = basePrisma();
      prisma.bom.findMany.mockResolvedValue([
        bomRow({
          parentProductId: componentProductId,
          items: [bomItemRow({ componentProductId: parentProductId })],
        }),
      ]);
      const { svc } = service(prisma);

      await expect(svc.create(actor, createDto())).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('allows a product to be both a BOM parent (in one BOM) and a component (in another)', async () => {
      const prisma = basePrisma();
      prisma.bom.findFirst.mockResolvedValue(null);
      prisma.bom.findMany.mockResolvedValue([]); // no existing BOM graph -> no cycle
      prisma.bom.create.mockResolvedValue(bomRow());
      const { svc } = service(prisma);

      // BOM #1: componentProductId is the parent (e.g. Cotton Yarn's own BOM)
      await expect(
        svc.create(actor, {
          parentProductId: componentProductId,
          bomQuantity: '1',
          outputUnitOfMeasureId: baseUnitId,
          items: [
            {
              componentProductId: parentProductId,
              quantity: '1',
              unitOfMeasureId: baseUnitId,
              sequence: 1,
            },
          ],
        }),
      ).resolves.toBeDefined();

      // BOM #2: parentProductId consumes componentProductId as a component
      await expect(svc.create(actor, createDto())).resolves.toBeDefined();
    });

    it('rejects an effectiveTo before effectiveFrom', async () => {
      const { svc } = service();

      await expect(
        svc.create(
          actor,
          createDto({
            effectiveFrom: '2026-06-01',
            effectiveTo: '2026-01-01',
          }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('list', () => {
    it('filters by tenant, and optionally by parentProductId', async () => {
      const prisma = basePrisma();
      prisma.bom.findMany.mockResolvedValue([bomRow()]);
      const { svc } = service(prisma);

      await svc.list(actor, parentProductId);

      expect(prisma.bom.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: actor.tenantId, parentProductId },
        }),
      );
    });

    it('omits the parentProductId filter when not supplied', async () => {
      const prisma = basePrisma();
      prisma.bom.findMany.mockResolvedValue([]);
      const { svc } = service(prisma);

      await svc.list(actor);

      expect(prisma.bom.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: actor.tenantId } }),
      );
    });
  });

  describe('getById', () => {
    it('404s when the BOM does not belong to the caller tenant', async () => {
      const prisma = basePrisma();
      prisma.bom.findFirst.mockResolvedValue(null);
      const { svc } = service(prisma);

      await expect(svc.getById(actor, 'missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.bom.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'missing', tenantId: actor.tenantId },
        }),
      );
    });

    it('never resolves a BOM scoped to a different tenant', async () => {
      const prisma = basePrisma();
      // findFirst is tenant-scoped in the where clause, so a cross-tenant
      // lookup always resolves null from Prisma itself.
      prisma.bom.findFirst.mockImplementation(({ where }: { where: { tenantId: string } }) =>
        where.tenantId === otherTenant ? bomRow() : null,
      );
      const { svc } = service(prisma);

      await expect(svc.getById(actor, 'bom11111-aaaa-4aaa-8aaa-bom111111111')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('rejects editing a non-DRAFT BOM', async () => {
      const prisma = basePrisma();
      prisma.bom.findFirst.mockResolvedValue(bomRow({ status: 'ACTIVE' }));
      const { svc } = service(prisma);

      await expect(
        svc.update(actor, 'bom11111-aaaa-4aaa-8aaa-bom111111111', { notes: 'x' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('replaces items for a DRAFT BOM', async () => {
      const prisma = basePrisma();
      prisma.bom.findFirst.mockResolvedValue(bomRow({ status: 'DRAFT' }));
      prisma.bom.update.mockResolvedValue(bomRow());
      const { svc } = service(prisma);

      await svc.update(actor, 'bom11111-aaaa-4aaa-8aaa-bom111111111', createDto());

      expect(prisma.bomItem.deleteMany).toHaveBeenCalledWith({
        where: { bomId: 'bom11111-aaaa-4aaa-8aaa-bom111111111' },
      });
      expect(prisma.bom.update).toHaveBeenCalled();
    });

    it('updates the bomQuantity of a DRAFT BOM', async () => {
      const prisma = basePrisma();
      prisma.bom.findFirst.mockResolvedValue(bomRow({ status: 'DRAFT' }));
      prisma.bom.update.mockResolvedValue(
        bomRow({ bomQuantity: new Prisma.Decimal('250.000000') }),
      );
      const { svc } = service(prisma);

      const result = await svc.update(
        actor,
        'bom11111-aaaa-4aaa-8aaa-bom111111111',
        { bomQuantity: '250' },
      );

      expect(prisma.bom.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bomQuantity: expect.any(Prisma.Decimal),
          }),
        }),
      );
      expect(result.bomQuantity).toBe('250.000000');
    });

    it('rejects updating bomQuantity to zero', async () => {
      const prisma = basePrisma();
      prisma.bom.findFirst.mockResolvedValue(bomRow({ status: 'DRAFT' }));
      const { svc } = service(prisma);

      await expect(
        svc.update(actor, 'bom11111-aaaa-4aaa-8aaa-bom111111111', {
          bomQuantity: '0',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('updates the outputUnitOfMeasureId of a DRAFT BOM, re-validating against the parent product', async () => {
      const prisma = basePrisma();
      prisma.bom.findFirst.mockResolvedValue(bomRow({ status: 'DRAFT' }));
      prisma.bom.update.mockResolvedValue(
        bomRow({ outputUnitOfMeasureId: altUnitId, outputUomCode: 'G', outputUomName: 'Gram' }),
      );
      const { svc } = service(prisma);

      const result = await svc.update(
        actor,
        'bom11111-aaaa-4aaa-8aaa-bom111111111',
        { outputUnitOfMeasureId: altUnitId },
      );

      expect(prisma.bom.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            outputUnitOfMeasureId: altUnitId,
            outputUomCode: 'G',
            outputUomName: 'Gram',
          }),
        }),
      );
      expect(result.outputUomCode).toBe('G');
    });

    it('rejects updating to an outputUnitOfMeasureId invalid for the parent product', async () => {
      const prisma = basePrisma();
      prisma.bom.findFirst.mockResolvedValue(bomRow({ status: 'DRAFT' }));
      const { svc } = service(prisma);
      const unknownUnitId = 'u9999999-aaaa-4aaa-8aaa-u99999999999';

      await expect(
        svc.update(actor, 'bom11111-aaaa-4aaa-8aaa-bom111111111', {
          outputUnitOfMeasureId: unknownUnitId,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('activate / deactivate', () => {
    it('activating a BOM deactivates any other ACTIVE BOM for the same parent product', async () => {
      const prisma = basePrisma();
      prisma.bom.findFirst.mockResolvedValue(bomRow({ status: 'DRAFT' }));
      prisma.bom.update.mockResolvedValue(bomRow({ status: 'ACTIVE' }));
      const { svc } = service(prisma);

      await svc.activate(actor, 'bom11111-aaaa-4aaa-8aaa-bom111111111');

      expect(prisma.bom.updateMany).toHaveBeenCalledWith({
        where: {
          tenantId: actor.tenantId,
          parentProductId,
          status: 'ACTIVE',
          NOT: { id: 'bom11111-aaaa-4aaa-8aaa-bom111111111' },
        },
        data: { status: 'INACTIVE' },
      });
      expect(prisma.bom.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'ACTIVE' } }),
      );
    });

    it('rejects activating an already-ACTIVE BOM', async () => {
      const prisma = basePrisma();
      prisma.bom.findFirst.mockResolvedValue(bomRow({ status: 'ACTIVE' }));
      const { svc } = service(prisma);

      await expect(
        svc.activate(actor, 'bom11111-aaaa-4aaa-8aaa-bom111111111'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects deactivating a BOM that is not ACTIVE', async () => {
      const prisma = basePrisma();
      prisma.bom.findFirst.mockResolvedValue(bomRow({ status: 'DRAFT' }));
      const { svc } = service(prisma);

      await expect(
        svc.deactivate(actor, 'bom11111-aaaa-4aaa-8aaa-bom111111111'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('deactivates an ACTIVE BOM', async () => {
      const prisma = basePrisma();
      prisma.bom.findFirst.mockResolvedValue(bomRow({ status: 'ACTIVE' }));
      prisma.bom.update.mockResolvedValue(bomRow({ status: 'INACTIVE' }));
      const { svc } = service(prisma);

      const result = await svc.deactivate(actor, 'bom11111-aaaa-4aaa-8aaa-bom111111111');

      expect(result.status).toBe('INACTIVE');
    });
  });

  describe('createNewVersion', () => {
    it('clones header + items into a new DRAFT at the next version, without re-calling the inventory client', async () => {
      const prisma = basePrisma();
      prisma.bom.findFirst
        .mockResolvedValueOnce(bomRow({ status: 'ACTIVE', version: 1 })) // requireBom
        .mockResolvedValueOnce(bomRow({ status: 'ACTIVE', version: 1 })); // nextVersion lookup
      prisma.bom.create.mockResolvedValue(bomRow({ version: 2, status: 'DRAFT' }));
      const inventory = defaultInventory();
      const { svc } = service(prisma, inventory);

      const result = await svc.createNewVersion(actor, 'bom11111-aaaa-4aaa-8aaa-bom111111111');

      expect(result.version).toBe(2);
      expect(result.status).toBe('DRAFT');
      expect(inventory.getProductDetail).not.toHaveBeenCalled();
    });

    it('clones bomQuantity and output UOM (id/code/name) from the source version', async () => {
      const prisma = basePrisma();
      const source = bomRow({
        status: 'ACTIVE',
        version: 1,
        bomQuantity: new Prisma.Decimal('100.000000'),
        outputUnitOfMeasureId: baseUnitId,
        outputUomCode: 'KG',
        outputUomName: 'Kilogram',
      });
      prisma.bom.findFirst
        .mockResolvedValueOnce(source) // requireBom
        .mockResolvedValueOnce(source); // nextVersion lookup
      prisma.bom.create.mockResolvedValue(bomRow({ version: 2, status: 'DRAFT' }));
      const { svc } = service(prisma);

      await svc.createNewVersion(actor, 'bom11111-aaaa-4aaa-8aaa-bom111111111');

      expect(prisma.bom.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bomQuantity: source.bomQuantity,
            outputUnitOfMeasureId: baseUnitId,
            outputUomCode: 'KG',
            outputUomName: 'Kilogram',
          }),
        }),
      );
    });
  });

  describe('remove', () => {
    it('rejects deleting a non-DRAFT BOM', async () => {
      const prisma = basePrisma();
      prisma.bom.findFirst.mockResolvedValue(bomRow({ status: 'ACTIVE' }));
      const { svc } = service(prisma);

      await expect(
        svc.remove(actor, 'bom11111-aaaa-4aaa-8aaa-bom111111111'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('deletes a DRAFT BOM', async () => {
      const prisma = basePrisma();
      prisma.bom.findFirst.mockResolvedValue(bomRow({ status: 'DRAFT' }));
      prisma.bom.delete.mockResolvedValue(bomRow());
      const { svc } = service(prisma);

      const result = await svc.remove(actor, 'bom11111-aaaa-4aaa-8aaa-bom111111111');

      expect(result).toEqual({
        id: 'bom11111-aaaa-4aaa-8aaa-bom111111111',
        removed: true,
      });
    });
  });
});
