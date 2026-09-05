import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AccountsService } from './accounts.service';

describe('AccountsService', () => {
  const actor = {
    userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    tenantId: '11111111-1111-4111-8111-111111111111',
  };
  const otherTenantId = '22222222-2222-4222-8222-222222222222';

  const baseRow = {
    id: 'acc-1',
    tenantId: actor.tenantId,
    code: '1000',
    name: 'Assets',
    type: 'ASSET',
    parentId: null,
    description: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    parent: null,
  };

  function buildService(prismaOverrides: Record<string, unknown> = {}) {
    const prisma = {
      account: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        ...prismaOverrides,
      },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new AccountsService(prisma as never, audit as never);
    return { service, prisma, audit };
  }

  describe('create', () => {
    it('creates an account with uppercased code and audits', async () => {
      const { service, prisma, audit } = buildService({
        create: jest.fn().mockResolvedValue(baseRow),
      });

      const result = await service.create(actor, {
        code: '1000',
        name: 'Assets',
        type: 'ASSET',
      });

      expect(prisma.account.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: actor.tenantId,
            code: '1000',
            name: 'Assets',
            type: 'ASSET',
            parentId: null,
          }),
        }),
      );
      expect(result.code).toBe('1000');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'account.created' }),
      );
    });

    it('maps a unique violation to ConflictException (duplicate code in same tenant)', async () => {
      const { service } = buildService({
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
      });

      await expect(
        service.create(actor, { code: '1000', name: 'Assets', type: 'ASSET' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a parent account that does not exist in this tenant', async () => {
      const { service, prisma } = buildService({
        findFirst: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.create(actor, {
          code: '1110',
          name: 'Bank',
          type: 'ASSET',
          parentId: 'missing-parent',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.account.create).not.toHaveBeenCalled();
    });

    it('creates a child account under a valid parent in the same tenant', async () => {
      const parentRow = {
        ...baseRow,
        id: 'parent-1',
        code: '1100',
        name: 'Current Assets',
      };
      const childRow = {
        ...baseRow,
        id: 'child-1',
        code: '1110',
        name: 'Bank',
        parentId: 'parent-1',
        parent: { id: 'parent-1', code: '1100', name: 'Current Assets' },
      };
      const { service, prisma } = buildService({
        findFirst: jest.fn().mockResolvedValue({ id: parentRow.id }),
        create: jest.fn().mockResolvedValue(childRow),
      });

      const result = await service.create(actor, {
        code: '1110',
        name: 'Bank',
        type: 'ASSET',
        parentId: 'parent-1',
      });

      expect(prisma.account.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'parent-1', tenantId: actor.tenantId },
        }),
      );
      expect(result.parent).toEqual({
        id: 'parent-1',
        code: '1100',
        name: 'Current Assets',
      });
    });
  });

  describe('list', () => {
    it('scopes results to the actor tenant', async () => {
      const { service, prisma } = buildService({
        findMany: jest.fn().mockResolvedValue([baseRow]),
      });

      const result = await service.list(actor);

      expect(prisma.account.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: actor.tenantId } }),
      );
      expect(result.items).toHaveLength(1);
    });
  });

  describe('getById', () => {
    it('returns the account when it belongs to the tenant', async () => {
      const { service } = buildService({
        findFirst: jest.fn().mockResolvedValue(baseRow),
      });

      const result = await service.getById(actor, baseRow.id);
      expect(result.id).toBe(baseRow.id);
    });

    it('throws NotFoundException for a different tenant (tenant isolation)', async () => {
      const { service, prisma } = buildService({
        findFirst: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.getById({ ...actor, tenantId: otherTenantId }, baseRow.id),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.account.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: baseRow.id, tenantId: otherTenantId },
        }),
      );
    });
  });

  describe('update', () => {
    it('updates provided fields and audits', async () => {
      const { service, prisma, audit } = buildService({
        findFirst: jest.fn().mockResolvedValue(baseRow),
        update: jest
          .fn()
          .mockResolvedValue({ ...baseRow, name: 'Total Assets' }),
      });

      const result = await service.update(actor, baseRow.id, {
        name: 'Total Assets',
      });

      expect(prisma.account.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: baseRow.id },
          data: { name: 'Total Assets' },
        }),
      );
      expect(result.name).toBe('Total Assets');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'account.updated' }),
      );
    });

    it('throws NotFoundException when the account is not in this tenant', async () => {
      const { service } = buildService({
        findFirst: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.update(actor, 'missing', { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when no fields are provided', async () => {
      const { service } = buildService({
        findFirst: jest.fn().mockResolvedValue(baseRow),
      });

      await expect(
        service.update(actor, baseRow.id, {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('maps a unique violation on update to ConflictException', async () => {
      const { service } = buildService({
        findFirst: jest.fn().mockResolvedValue(baseRow),
        update: jest.fn().mockRejectedValue({ code: 'P2002' }),
      });

      await expect(
        service.update(actor, baseRow.id, { code: '2000' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects setting an account as its own parent', async () => {
      const { service } = buildService({
        findFirst: jest.fn().mockResolvedValue(baseRow),
      });

      await expect(
        service.update(actor, baseRow.id, { parentId: baseRow.id }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects setting a descendant account as the parent (cycle prevention)', async () => {
      // Tree: root (id=root) -> child (id=child, parentId=root)
      // Attempting root.parentId = child must be rejected.
      const root = { ...baseRow, id: 'root', parentId: null };

      const findFirst = jest.fn();
      findFirst
        .mockResolvedValueOnce(root) // require(actor, 'root') inside update()
        .mockResolvedValueOnce({ id: 'child', parentId: 'root' }) // assertNoCycle walk: fetch 'child'
        .mockResolvedValueOnce({ id: 'root', parentId: null }); // assertNoCycle walk: fetch 'root' (cycle found)

      const { service } = buildService({ findFirst });

      await expect(
        service.update(actor, 'root', { parentId: 'child' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows moving an account under a valid, unrelated parent', async () => {
      const findFirst = jest.fn();
      findFirst
        .mockResolvedValueOnce(baseRow) // require()
        .mockResolvedValueOnce({ id: 'new-parent', parentId: null }); // assertNoCycle walk

      const { service, prisma } = buildService({
        findFirst,
        update: jest
          .fn()
          .mockResolvedValue({ ...baseRow, parentId: 'new-parent' }),
      });

      await service.update(actor, baseRow.id, { parentId: 'new-parent' });

      expect(prisma.account.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { parentId: 'new-parent' } }),
      );
    });

    it('clears the parent when parentId is explicitly null', async () => {
      const { service, prisma } = buildService({
        findFirst: jest
          .fn()
          .mockResolvedValue({ ...baseRow, parentId: 'parent-1' }),
        update: jest.fn().mockResolvedValue({ ...baseRow, parentId: null }),
      });

      await service.update(actor, baseRow.id, { parentId: null });

      expect(prisma.account.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { parentId: null } }),
      );
    });
  });

  describe('updateStatus', () => {
    it('activates and deactivates an account, recording the transition', async () => {
      const { service, prisma, audit } = buildService({
        findFirst: jest.fn().mockResolvedValue({ ...baseRow, isActive: true }),
        update: jest.fn().mockResolvedValue({ ...baseRow, isActive: false }),
      });

      const result = await service.updateStatus(actor, baseRow.id, {
        isActive: false,
      });

      expect(prisma.account.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } }),
      );
      expect(result.isActive).toBe(false);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'account.status_changed',
          metadata: { from: true, to: false },
        }),
      );
    });

    it('throws NotFoundException for an account outside the tenant', async () => {
      const { service } = buildService({
        findFirst: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.updateStatus(actor, 'missing', { isActive: false }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
