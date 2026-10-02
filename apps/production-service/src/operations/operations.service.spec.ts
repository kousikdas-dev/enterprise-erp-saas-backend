import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { OperationsService } from './operations.service';

describe('OperationsService', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const otherTenant = 'bbbbbbbb-aaaa-4aaa-8aaa-bbbbbbbbbbbb';
  const id = 'op111111-aaaa-4aaa-8aaa-op1111111111';

  function operationRow(overrides: Record<string, unknown> = {}) {
    return {
      id,
      tenantId: actor.tenantId,
      code: 'CUT',
      name: 'Cutting',
      description: null,
      isActive: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      ...overrides,
    };
  }

  function basePrisma(overrides: Record<string, unknown> = {}) {
    return {
      operation: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        ...(overrides as Record<string, unknown>),
      },
    };
  }

  function service(prisma = basePrisma()) {
    return { svc: new OperationsService(prisma as never), prisma };
  }

  describe('create', () => {
    it('creates an operation, normalizing code to uppercase and trimming name', async () => {
      const prisma = basePrisma();
      prisma.operation.create.mockResolvedValue(operationRow());
      const { svc } = service(prisma);

      const result = await svc.create(actor, {
        code: ' cut ',
        name: '  Cutting  ',
      });

      expect(prisma.operation.create).toHaveBeenCalledWith({
        data: {
          tenantId: actor.tenantId,
          code: 'CUT',
          name: 'Cutting',
          description: null,
        },
      });
      expect(result).toMatchObject({ code: 'CUT', name: 'Cutting' });
    });

    it('trims an optional description', async () => {
      const prisma = basePrisma();
      prisma.operation.create.mockResolvedValue(
        operationRow({ description: 'Cut steel plate' }),
      );
      const { svc } = service(prisma);

      await svc.create(actor, {
        code: 'CUT',
        name: 'Cutting',
        description: '  Cut steel plate  ',
      });

      expect(prisma.operation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ description: 'Cut steel plate' }),
        }),
      );
    });

    it('rejects a duplicate code within the same tenant', async () => {
      const prisma = basePrisma();
      prisma.operation.create.mockRejectedValue(
        Object.assign(new Error('conflict'), { code: 'P2002' }),
      );
      const { svc } = service(prisma);

      await expect(
        svc.create(actor, { code: 'CUT', name: 'Cutting' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('list', () => {
    it('lists operations scoped to the tenant, ordered by code', async () => {
      const prisma = basePrisma();
      prisma.operation.findMany.mockResolvedValue([operationRow()]);
      const { svc } = service(prisma);

      const result = await svc.list(actor);

      expect(prisma.operation.findMany).toHaveBeenCalledWith({
        where: { tenantId: actor.tenantId },
        orderBy: { code: 'asc' },
      });
      expect(result.items).toHaveLength(1);
    });
  });

  describe('getById', () => {
    it('404s when the operation does not belong to the caller tenant', async () => {
      const prisma = basePrisma();
      prisma.operation.findFirst.mockResolvedValue(null);
      const { svc } = service(prisma);

      await expect(svc.getById(actor, id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.operation.findFirst).toHaveBeenCalledWith({
        where: { id, tenantId: actor.tenantId },
      });
    });

    it('never resolves an operation scoped to a different tenant', async () => {
      const prisma = basePrisma();
      prisma.operation.findFirst.mockImplementation(
        ({ where }: { where: { tenantId: string } }) =>
          where.tenantId === otherTenant ? operationRow() : null,
      );
      const { svc } = service(prisma);

      await expect(svc.getById(actor, id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates provided fields only, normalizing code and name', async () => {
      const prisma = basePrisma();
      prisma.operation.findFirst.mockResolvedValue(operationRow());
      prisma.operation.update.mockResolvedValue(
        operationRow({ code: 'WELD', name: 'Welding' }),
      );
      const { svc } = service(prisma);

      const result = await svc.update(actor, id, {
        code: ' weld ',
        name: '  Welding  ',
      });

      expect(prisma.operation.update).toHaveBeenCalledWith({
        where: { id },
        data: { code: 'WELD', name: 'Welding' },
      });
      expect(result).toMatchObject({ code: 'WELD', name: 'Welding' });
    });

    it('rejects an empty update payload', async () => {
      const prisma = basePrisma();
      prisma.operation.findFirst.mockResolvedValue(operationRow());
      const { svc } = service(prisma);

      await expect(svc.update(actor, id, {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects updating to a code already used by another operation in the tenant', async () => {
      const prisma = basePrisma();
      prisma.operation.findFirst.mockResolvedValue(operationRow());
      prisma.operation.update.mockRejectedValue(
        Object.assign(new Error('conflict'), { code: 'P2002' }),
      );
      const { svc } = service(prisma);

      await expect(
        svc.update(actor, id, { code: 'WELD' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('404s when updating an operation outside the caller tenant', async () => {
      const prisma = basePrisma();
      prisma.operation.findFirst.mockResolvedValue(null);
      const { svc } = service(prisma);

      await expect(
        svc.update(actor, id, { name: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('activate / deactivate', () => {
    it('deactivates an active operation', async () => {
      const prisma = basePrisma();
      prisma.operation.findFirst.mockResolvedValue(operationRow({ isActive: true }));
      prisma.operation.update.mockResolvedValue(
        operationRow({ isActive: false }),
      );
      const { svc } = service(prisma);

      const result = await svc.deactivate(actor, id);

      expect(prisma.operation.update).toHaveBeenCalledWith({
        where: { id },
        data: { isActive: false },
      });
      expect(result.isActive).toBe(false);
    });

    it('rejects deactivating an already-inactive operation', async () => {
      const prisma = basePrisma();
      prisma.operation.findFirst.mockResolvedValue(
        operationRow({ isActive: false }),
      );
      const { svc } = service(prisma);

      await expect(svc.deactivate(actor, id)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('activates an inactive operation', async () => {
      const prisma = basePrisma();
      prisma.operation.findFirst.mockResolvedValue(
        operationRow({ isActive: false }),
      );
      prisma.operation.update.mockResolvedValue(
        operationRow({ isActive: true }),
      );
      const { svc } = service(prisma);

      const result = await svc.activate(actor, id);

      expect(result.isActive).toBe(true);
    });

    it('rejects activating an already-active operation', async () => {
      const prisma = basePrisma();
      prisma.operation.findFirst.mockResolvedValue(
        operationRow({ isActive: true }),
      );
      const { svc } = service(prisma);

      await expect(svc.activate(actor, id)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('remove', () => {
    it('deletes an operation scoped to the tenant', async () => {
      const prisma = basePrisma();
      prisma.operation.findFirst.mockResolvedValue(operationRow());
      prisma.operation.delete.mockResolvedValue(operationRow());
      const { svc } = service(prisma);

      const result = await svc.remove(actor, id);

      expect(prisma.operation.delete).toHaveBeenCalledWith({ where: { id } });
      expect(result).toEqual({ id, removed: true });
    });

    it('404s when removing an operation outside the caller tenant', async () => {
      const prisma = basePrisma();
      prisma.operation.findFirst.mockResolvedValue(null);
      const { svc } = service(prisma);

      await expect(svc.remove(actor, id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
