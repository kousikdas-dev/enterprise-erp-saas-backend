import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma-client';
import { RoutingsService } from './routings.service';

describe('RoutingsService', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };

  const productId = 'p1111111-aaaa-4aaa-8aaa-p11111111111';
  const operationId = 'o2222222-aaaa-4aaa-8aaa-o22222222222';
  const operationId2 = 'o3333333-aaaa-4aaa-8aaa-o33333333333';
  const workCentreId = 'w4444444-aaaa-4aaa-8aaa-w44444444444';
  const workCentreId2 = 'w5555555-aaaa-4aaa-8aaa-w55555555555';
  const routingId = 'r6666666-aaaa-4aaa-8aaa-r66666666666';

  function productDetail(overrides: Record<string, unknown> = {}) {
    return {
      id: productId,
      sku: 'YARN-40S',
      name: 'Cotton Yarn 40s',
      isActive: true,
      trackInventory: true,
      productType: 'GOODS',
      categoryId: 'cat11111-aaaa-4aaa-8aaa-cat111111111',
      unitOfMeasureId: 'u0000000-aaaa-4aaa-8aaa-u00000000000',
      base: { unitOfMeasureId: 'u0000000-aaaa-4aaa-8aaa-u00000000000', code: 'KG', name: 'Kilogram' },
      alternatives: [],
      ...overrides,
    };
  }

  function operationRow(overrides: Record<string, unknown> = {}) {
    return {
      id: operationId,
      tenantId: actor.tenantId,
      code: 'MIX',
      name: 'Mixing',
      description: null,
      isActive: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      ...overrides,
    };
  }

  function workCentreRow(overrides: Record<string, unknown> = {}) {
    return {
      id: workCentreId,
      tenantId: actor.tenantId,
      code: 'MIX-01',
      name: 'Mixing Centre',
      description: null,
      isActive: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      ...overrides,
    };
  }

  function routingStepRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'step1111-aaaa-4aaa-8aaa-step111111111',
      tenantId: actor.tenantId,
      routingId,
      sequence: 10,
      operationId,
      operationCode: 'MIX',
      operationName: 'Mixing',
      workCentreId,
      workCentreCode: 'MIX-01',
      workCentreName: 'Mixing Centre',
      setupMinutes: 15,
      runMinutesPerUnit: new Prisma.Decimal('2.500000'),
      description: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      ...overrides,
    };
  }

  function routingRow(overrides: Record<string, unknown> = {}) {
    return {
      id: routingId,
      tenantId: actor.tenantId,
      productId,
      productSku: 'YARN-40S',
      productName: 'Cotton Yarn 40s',
      name: 'Standard Route',
      version: 1,
      status: 'DRAFT',
      description: null,
      effectiveFrom: null,
      effectiveTo: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      steps: [routingStepRow()],
      ...overrides,
    };
  }

  function createDto(overrides: Record<string, unknown> = {}) {
    return {
      productId,
      name: 'Standard Route',
      steps: [
        {
          operationId,
          workCentreId,
          sequence: 10,
          setupMinutes: 15,
          runMinutesPerUnit: '2.5',
        },
      ],
      ...overrides,
    };
  }

  function basePrisma(overrides: Record<string, unknown> = {}) {
    const prisma = {
      routing: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        delete: jest.fn(),
      },
      routingStep: {
        deleteMany: jest.fn(),
      },
      operation: {
        findFirst: jest.fn(async ({ where }: { where: { id: string } }) => {
          if (where.id === operationId) return operationRow();
          if (where.id === operationId2)
            return operationRow({ id: operationId2, code: 'INSP', name: 'Inspection' });
          return null;
        }),
      },
      workCentre: {
        findFirst: jest.fn(async ({ where }: { where: { id: string } }) => {
          if (where.id === workCentreId) return workCentreRow();
          if (where.id === workCentreId2)
            return workCentreRow({ id: workCentreId2, code: 'INSP-01', name: 'Inspection Bay' });
          return null;
        }),
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
      getProductDetail: jest.fn(async (_actor: unknown, id: string) =>
        productDetail({ id }),
      ),
      ...overrides,
    };
  }

  function service(prisma = basePrisma(), inventory = defaultInventory()) {
    return {
      svc: new RoutingsService(prisma as never, inventory as never),
      prisma,
      inventory,
    };
  }

  describe('create', () => {
    it('creates a version-1 DRAFT routing, snapshotting product + step detail', async () => {
      const prisma = basePrisma();
      prisma.routing.findFirst.mockResolvedValue(null);
      prisma.routing.create.mockResolvedValue(routingRow());
      const { svc } = service(prisma);

      const result = await svc.create(actor, createDto());

      expect(prisma.routing.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: actor.tenantId,
            productId,
            productSku: 'YARN-40S',
            productName: 'Cotton Yarn 40s',
            name: 'Standard Route',
            version: 1,
            status: 'DRAFT',
            steps: {
              create: [
                expect.objectContaining({
                  operationId,
                  operationCode: 'MIX',
                  workCentreId,
                  workCentreCode: 'MIX-01',
                  setupMinutes: 15,
                  sequence: 10,
                }),
              ],
            },
          }),
        }),
      );
      expect(result.version).toBe(1);
      expect(result.steps[0].runMinutesPerUnit).toBe('2.500000');
    });

    it('allows creating a routing with zero steps (activation is what requires at least one)', async () => {
      const prisma = basePrisma();
      prisma.routing.findFirst.mockResolvedValue(null);
      prisma.routing.create.mockResolvedValue(routingRow({ steps: [] }));
      const { svc } = service(prisma);

      await svc.create(actor, createDto({ steps: undefined }));

      expect(prisma.routing.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ steps: { create: [] } }),
        }),
      );
    });

    it('allows the same operation to repeat across steps', async () => {
      const prisma = basePrisma();
      prisma.routing.findFirst.mockResolvedValue(null);
      prisma.routing.create.mockResolvedValue(routingRow());
      const { svc } = service(prisma);

      await svc.create(
        actor,
        createDto({
          steps: [
            { operationId, workCentreId, sequence: 10 },
            { operationId, workCentreId: workCentreId2, sequence: 20 },
          ],
        }),
      );

      expect(prisma.routing.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            steps: {
              create: [
                expect.objectContaining({ operationId, sequence: 10 }),
                expect.objectContaining({ operationId, sequence: 20 }),
              ],
            },
          }),
        }),
      );
    });

    it('rejects duplicate sequence numbers within one routing', async () => {
      const { svc } = service();

      await expect(
        svc.create(
          actor,
          createDto({
            steps: [
              { operationId, workCentreId, sequence: 10 },
              { operationId: operationId2, workCentreId: workCentreId2, sequence: 10 },
            ],
          }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an operation that does not exist for this tenant', async () => {
      const { svc } = service();

      await expect(
        svc.create(
          actor,
          createDto({
            steps: [{ operationId: 'ffffffff-aaaa-4aaa-8aaa-ffffffffffff', workCentreId, sequence: 10 }],
          }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an inactive operation', async () => {
      const prisma = basePrisma();
      prisma.operation.findFirst.mockResolvedValue(operationRow({ isActive: false }));
      const { svc } = service(prisma);

      await expect(svc.create(actor, createDto())).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a work centre that does not exist for this tenant', async () => {
      const { svc } = service();

      await expect(
        svc.create(
          actor,
          createDto({
            steps: [{ operationId, workCentreId: 'ffffffff-aaaa-4aaa-8aaa-ffffffffffff', sequence: 10 }],
          }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an inactive work centre', async () => {
      const prisma = basePrisma();
      prisma.workCentre.findFirst.mockResolvedValue(workCentreRow({ isActive: false }));
      const { svc } = service(prisma);

      await expect(svc.create(actor, createDto())).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects an inactive product', async () => {
      const prisma = basePrisma();
      const inventory = defaultInventory({
        getProductDetail: jest.fn(async () => productDetail({ isActive: false })),
      });
      const { svc } = service(prisma, inventory);

      await expect(svc.create(actor, createDto())).rejects.toBeInstanceOf(ConflictException);
    });

    it('retries version allocation on a unique-constraint race and eventually succeeds', async () => {
      const prisma = basePrisma();
      prisma.routing.findFirst.mockResolvedValue(null);
      prisma.routing.create
        .mockRejectedValueOnce({ code: 'P2002' })
        .mockResolvedValueOnce(routingRow({ version: 2 }));
      const { svc } = service(prisma);

      const result = await svc.create(actor, createDto());
      expect(result.version).toBe(2);
      expect(prisma.routing.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('list / getById', () => {
    it('lists only the actor tenant, ordered by productId asc, version desc', async () => {
      const prisma = basePrisma();
      const { svc } = service(prisma);

      await svc.list(actor);

      expect(prisma.routing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: actor.tenantId },
          orderBy: [{ productId: 'asc' }, { version: 'desc' }],
        }),
      );
    });

    it('filters by productId when provided', async () => {
      const prisma = basePrisma();
      const { svc } = service(prisma);

      await svc.list(actor, productId);

      expect(prisma.routing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: actor.tenantId, productId },
        }),
      );
    });

    it('returns 404 for another tenant routing', async () => {
      const prisma = basePrisma();
      prisma.routing.findFirst.mockResolvedValue(null);
      const { svc } = service(prisma);

      await expect(svc.getById(actor, routingId)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.routing.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: routingId, tenantId: actor.tenantId } }),
      );
    });
  });

  describe('update', () => {
    it('only allows editing a DRAFT routing', async () => {
      const prisma = basePrisma();
      prisma.routing.findFirst.mockResolvedValue(routingRow({ status: 'ACTIVE' }));
      const { svc } = service(prisma);

      await expect(svc.update(actor, routingId, { name: 'New name' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('replaces steps wholesale when provided', async () => {
      const prisma = basePrisma();
      prisma.routing.findFirst.mockResolvedValue(routingRow());
      prisma.routing.update.mockResolvedValue(routingRow());
      const { svc } = service(prisma);

      await svc.update(actor, routingId, {
        steps: [{ operationId, workCentreId, sequence: 20 }],
      });

      expect(prisma.routingStep.deleteMany).toHaveBeenCalledWith({
        where: { routingId },
      });
      expect(prisma.routing.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            steps: { create: [expect.objectContaining({ sequence: 20 })] },
          }),
        }),
      );
    });

    it('leaves steps untouched when omitted', async () => {
      const prisma = basePrisma();
      prisma.routing.findFirst.mockResolvedValue(routingRow());
      prisma.routing.update.mockResolvedValue(routingRow({ name: 'Renamed' }));
      const { svc } = service(prisma);

      await svc.update(actor, routingId, { name: 'Renamed' });

      expect(prisma.routingStep.deleteMany).not.toHaveBeenCalled();
      expect(prisma.routing.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ name: 'Renamed' }) }),
      );
    });
  });

  describe('activate / deactivate', () => {
    it('requires at least one step to activate', async () => {
      const prisma = basePrisma();
      prisma.routing.findFirst.mockResolvedValue(routingRow({ steps: [] }));
      const { svc } = service(prisma);

      await expect(svc.activate(actor, routingId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('activating deactivates every other ACTIVE routing for the same product', async () => {
      const prisma = basePrisma();
      prisma.routing.findFirst.mockResolvedValue(routingRow());
      prisma.routing.update.mockResolvedValue(routingRow({ status: 'ACTIVE' }));
      const { svc } = service(prisma);

      await svc.activate(actor, routingId);

      expect(prisma.routing.updateMany).toHaveBeenCalledWith({
        where: {
          tenantId: actor.tenantId,
          productId,
          status: 'ACTIVE',
          NOT: { id: routingId },
        },
        data: { status: 'INACTIVE' },
      });
      expect(prisma.routing.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'ACTIVE' } }),
      );
    });

    it('rejects activating an already-ACTIVE routing', async () => {
      const prisma = basePrisma();
      prisma.routing.findFirst.mockResolvedValue(routingRow({ status: 'ACTIVE' }));
      const { svc } = service(prisma);

      await expect(svc.activate(actor, routingId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('only allows deactivating an ACTIVE routing', async () => {
      const prisma = basePrisma();
      prisma.routing.findFirst.mockResolvedValue(routingRow({ status: 'DRAFT' }));
      const { svc } = service(prisma);

      await expect(svc.deactivate(actor, routingId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('deactivates an ACTIVE routing', async () => {
      const prisma = basePrisma();
      prisma.routing.findFirst.mockResolvedValue(routingRow({ status: 'ACTIVE' }));
      prisma.routing.update.mockResolvedValue(routingRow({ status: 'INACTIVE' }));
      const { svc } = service(prisma);

      const result = await svc.deactivate(actor, routingId);
      expect(result.status).toBe('INACTIVE');
    });
  });

  describe('createNewVersion', () => {
    it.each(['DRAFT', 'ACTIVE', 'INACTIVE'])(
      'clones a %s routing into a new DRAFT version, cloning its steps',
      async (sourceStatus) => {
        const prisma = basePrisma();
        prisma.routing.findFirst
          .mockResolvedValueOnce(routingRow({ status: sourceStatus }))
          .mockResolvedValueOnce(routingRow({ version: 1 }));
        prisma.routing.create.mockResolvedValue(routingRow({ version: 2, status: 'DRAFT' }));
        const { svc } = service(prisma);

        const result = await svc.createNewVersion(actor, routingId);

        expect(result.version).toBe(2);
        expect(result.status).toBe('DRAFT');
        expect(prisma.routing.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: 'DRAFT',
              productId,
              steps: {
                create: [expect.objectContaining({ operationId, sequence: 10 })],
              },
            }),
          }),
        );
      },
    );
  });

  describe('remove', () => {
    it('only allows deleting a DRAFT routing', async () => {
      const prisma = basePrisma();
      prisma.routing.findFirst.mockResolvedValue(routingRow({ status: 'ACTIVE' }));
      const { svc } = service(prisma);

      await expect(svc.remove(actor, routingId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('deletes a DRAFT routing', async () => {
      const prisma = basePrisma();
      prisma.routing.findFirst.mockResolvedValue(routingRow());
      const { svc } = service(prisma);

      const result = await svc.remove(actor, routingId);
      expect(result).toEqual({ id: routingId, removed: true });
      expect(prisma.routing.delete).toHaveBeenCalledWith({ where: { id: routingId } });
    });
  });
});
