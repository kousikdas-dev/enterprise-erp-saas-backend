import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { WorkCentresService } from './work-centres.service';

describe('WorkCentresService', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const otherTenant = 'bbbbbbbb-aaaa-4aaa-8aaa-bbbbbbbbbbbb';
  const id = 'wc111111-aaaa-4aaa-8aaa-wc1111111111';

  function workCentreRow(overrides: Record<string, unknown> = {}) {
    return {
      id,
      tenantId: actor.tenantId,
      code: 'CNC-01',
      name: 'CNC Machine 01',
      description: null,
      isActive: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      ...overrides,
    };
  }

  function basePrisma(overrides: Record<string, unknown> = {}) {
    return {
      workCentre: {
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
    return { svc: new WorkCentresService(prisma as never), prisma };
  }

  describe('create', () => {
    it('creates a work centre, normalizing code to uppercase and trimming name', async () => {
      const prisma = basePrisma();
      prisma.workCentre.create.mockResolvedValue(workCentreRow());
      const { svc } = service(prisma);

      const result = await svc.create(actor, {
        code: ' cnc-01 ',
        name: '  CNC Machine 01  ',
      });

      expect(prisma.workCentre.create).toHaveBeenCalledWith({
        data: {
          tenantId: actor.tenantId,
          code: 'CNC-01',
          name: 'CNC Machine 01',
          description: null,
        },
      });
      expect(result).toMatchObject({ code: 'CNC-01', name: 'CNC Machine 01' });
    });

    it('trims an optional description', async () => {
      const prisma = basePrisma();
      prisma.workCentre.create.mockResolvedValue(
        workCentreRow({ description: '5-axis machining centre' }),
      );
      const { svc } = service(prisma);

      await svc.create(actor, {
        code: 'CNC-01',
        name: 'CNC Machine 01',
        description: '  5-axis machining centre  ',
      });

      expect(prisma.workCentre.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ description: '5-axis machining centre' }),
        }),
      );
    });

    it('rejects a duplicate code within the same tenant', async () => {
      const prisma = basePrisma();
      prisma.workCentre.create.mockRejectedValue(
        Object.assign(new Error('conflict'), { code: 'P2002' }),
      );
      const { svc } = service(prisma);

      await expect(
        svc.create(actor, { code: 'CNC-01', name: 'CNC Machine 01' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('allows the same code to be used by a different tenant (tenant-scoped uniqueness)', async () => {
      const prisma = basePrisma();
      prisma.workCentre.create.mockResolvedValue(
        workCentreRow({ tenantId: otherTenant }),
      );
      const { svc } = service(prisma);

      await expect(
        svc.create(
          { userId: 'u2', tenantId: otherTenant },
          { code: 'CNC-01', name: 'CNC Machine 01' },
        ),
      ).resolves.toMatchObject({ code: 'CNC-01' });
      expect(prisma.workCentre.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: otherTenant }),
        }),
      );
    });
  });

  describe('list', () => {
    it('lists work centres scoped to the tenant, ordered by code', async () => {
      const prisma = basePrisma();
      prisma.workCentre.findMany.mockResolvedValue([workCentreRow()]);
      const { svc } = service(prisma);

      const result = await svc.list(actor);

      expect(prisma.workCentre.findMany).toHaveBeenCalledWith({
        where: { tenantId: actor.tenantId },
        orderBy: { code: 'asc' },
      });
      expect(result.items).toHaveLength(1);
    });
  });

  describe('getById', () => {
    it('404s when the work centre does not belong to the caller tenant', async () => {
      const prisma = basePrisma();
      prisma.workCentre.findFirst.mockResolvedValue(null);
      const { svc } = service(prisma);

      await expect(svc.getById(actor, id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.workCentre.findFirst).toHaveBeenCalledWith({
        where: { id, tenantId: actor.tenantId },
      });
    });

    it('never resolves a work centre scoped to a different tenant', async () => {
      const prisma = basePrisma();
      prisma.workCentre.findFirst.mockImplementation(
        ({ where }: { where: { tenantId: string } }) =>
          where.tenantId === otherTenant ? workCentreRow() : null,
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
      prisma.workCentre.findFirst.mockResolvedValue(workCentreRow());
      prisma.workCentre.update.mockResolvedValue(
        workCentreRow({ code: 'CNC-02', name: 'CNC Machine 02' }),
      );
      const { svc } = service(prisma);

      const result = await svc.update(actor, id, {
        code: ' cnc-02 ',
        name: '  CNC Machine 02  ',
      });

      expect(prisma.workCentre.update).toHaveBeenCalledWith({
        where: { id },
        data: { code: 'CNC-02', name: 'CNC Machine 02' },
      });
      expect(result).toMatchObject({ code: 'CNC-02', name: 'CNC Machine 02' });
    });

    it('rejects an empty update payload', async () => {
      const prisma = basePrisma();
      prisma.workCentre.findFirst.mockResolvedValue(workCentreRow());
      const { svc } = service(prisma);

      await expect(svc.update(actor, id, {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects updating to a code already used by another work centre in the tenant', async () => {
      const prisma = basePrisma();
      prisma.workCentre.findFirst.mockResolvedValue(workCentreRow());
      prisma.workCentre.update.mockRejectedValue(
        Object.assign(new Error('conflict'), { code: 'P2002' }),
      );
      const { svc } = service(prisma);

      await expect(
        svc.update(actor, id, { code: 'CNC-02' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('404s when updating a work centre outside the caller tenant', async () => {
      const prisma = basePrisma();
      prisma.workCentre.findFirst.mockResolvedValue(null);
      const { svc } = service(prisma);

      await expect(
        svc.update(actor, id, { name: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('activate / deactivate', () => {
    it('deactivates an active work centre', async () => {
      const prisma = basePrisma();
      prisma.workCentre.findFirst.mockResolvedValue(
        workCentreRow({ isActive: true }),
      );
      prisma.workCentre.update.mockResolvedValue(
        workCentreRow({ isActive: false }),
      );
      const { svc } = service(prisma);

      const result = await svc.deactivate(actor, id);

      expect(prisma.workCentre.update).toHaveBeenCalledWith({
        where: { id },
        data: { isActive: false },
      });
      expect(result.isActive).toBe(false);
    });

    it('rejects deactivating an already-inactive work centre', async () => {
      const prisma = basePrisma();
      prisma.workCentre.findFirst.mockResolvedValue(
        workCentreRow({ isActive: false }),
      );
      const { svc } = service(prisma);

      await expect(svc.deactivate(actor, id)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('activates an inactive work centre', async () => {
      const prisma = basePrisma();
      prisma.workCentre.findFirst.mockResolvedValue(
        workCentreRow({ isActive: false }),
      );
      prisma.workCentre.update.mockResolvedValue(
        workCentreRow({ isActive: true }),
      );
      const { svc } = service(prisma);

      const result = await svc.activate(actor, id);

      expect(result.isActive).toBe(true);
    });

    it('rejects activating an already-active work centre', async () => {
      const prisma = basePrisma();
      prisma.workCentre.findFirst.mockResolvedValue(
        workCentreRow({ isActive: true }),
      );
      const { svc } = service(prisma);

      await expect(svc.activate(actor, id)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('remove', () => {
    it('deletes a work centre scoped to the tenant', async () => {
      const prisma = basePrisma();
      prisma.workCentre.findFirst.mockResolvedValue(workCentreRow());
      prisma.workCentre.delete.mockResolvedValue(workCentreRow());
      const { svc } = service(prisma);

      const result = await svc.remove(actor, id);

      expect(prisma.workCentre.delete).toHaveBeenCalledWith({ where: { id } });
      expect(result).toEqual({ id, removed: true });
    });

    it('404s when removing a work centre outside the caller tenant', async () => {
      const prisma = basePrisma();
      prisma.workCentre.findFirst.mockResolvedValue(null);
      const { svc } = service(prisma);

      await expect(svc.remove(actor, id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
