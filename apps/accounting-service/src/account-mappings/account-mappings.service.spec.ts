import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AccountMappingPurpose } from '../../generated/prisma-client';
import { AccountMappingsService } from './account-mappings.service';

describe('AccountMappingsService', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const actor = { userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', tenantId };

  const expenseAccount = {
    id: 'acc-expense',
    tenantId,
    code: '5000',
    name: 'Purchases',
    isActive: true,
  };
  const apAccount = {
    id: 'acc-ap',
    tenantId,
    code: '2000',
    name: 'Accounts Payable',
    isActive: true,
  };

  function buildService(
    overrides: {
      accountMapping?: Partial<Record<string, jest.Mock>>;
      account?: Partial<Record<string, jest.Mock>>;
    } = {},
  ) {
    const prisma = {
      accountMapping: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        ...overrides.accountMapping,
      },
      account: {
        findFirst: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
          if (where.id === expenseAccount.id) return Promise.resolve(expenseAccount);
          if (where.id === apAccount.id) return Promise.resolve(apAccount);
          return Promise.resolve(null);
        }),
        ...overrides.account,
      },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new AccountMappingsService(prisma as never, audit as never);
    return { service, prisma, audit };
  }

  describe('create', () => {
    it('creates a tenant-wide singleton mapping at externalRefId = ""', async () => {
      const { service, prisma } = buildService({
        accountMapping: {
          create: jest.fn().mockResolvedValue({
            id: 'map-1',
            tenantId,
            purpose: AccountMappingPurpose.PURCHASE_EXPENSE,
            externalRefId: '',
            accountId: expenseAccount.id,
            account: expenseAccount,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        },
      });

      const result = await service.create(actor, {
        purpose: 'PURCHASE_EXPENSE',
        accountId: expenseAccount.id,
      });

      expect(result.externalRefId).toBe('');
      expect(prisma.accountMapping.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ externalRefId: '' }),
        }),
      );
    });

    it('rejects a singleton purpose that supplies externalRefId', async () => {
      const { service } = buildService();
      await expect(
        service.create(actor, {
          purpose: 'ACCOUNTS_PAYABLE',
          externalRefId: 'should-not-be-here',
          accountId: apAccount.id,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects PAYMENT_METHOD without externalRefId', async () => {
      const { service } = buildService();
      await expect(
        service.create(actor, {
          purpose: 'PAYMENT_METHOD',
          accountId: apAccount.id,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates a per-entity PAYMENT_METHOD mapping with the given externalRefId', async () => {
      const { service, prisma } = buildService({
        accountMapping: {
          create: jest.fn().mockResolvedValue({
            id: 'map-2',
            tenantId,
            purpose: AccountMappingPurpose.PAYMENT_METHOD,
            externalRefId: 'pm-cash',
            accountId: apAccount.id,
            account: apAccount,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        },
      });

      await service.create(actor, {
        purpose: 'PAYMENT_METHOD',
        externalRefId: 'pm-cash',
        accountId: apAccount.id,
      });

      expect(prisma.accountMapping.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ externalRefId: 'pm-cash' }),
        }),
      );
    });

    it('rejects when the account does not exist in this tenant', async () => {
      const { service } = buildService();
      await expect(
        service.create(actor, { purpose: 'PURCHASE_EXPENSE', accountId: 'missing' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a duplicate mapping for the same purpose/entity', async () => {
      const conflict = Object.assign(new Error('duplicate'), { code: 'P2002' });
      const { service } = buildService({
        accountMapping: { create: jest.fn().mockRejectedValue(conflict) },
      });
      await expect(
        service.create(actor, { purpose: 'PURCHASE_EXPENSE', accountId: expenseAccount.id }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update / remove', () => {
    it('rejects update when the mapping does not exist', async () => {
      const { service } = buildService({
        accountMapping: { findFirst: jest.fn().mockResolvedValue(null) },
      });
      await expect(
        service.update(actor, 'missing', { accountId: apAccount.id }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('updates the mapped account', async () => {
      const { service, prisma } = buildService({
        accountMapping: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'map-1',
            tenantId,
            purpose: AccountMappingPurpose.PURCHASE_EXPENSE,
            externalRefId: '',
            accountId: expenseAccount.id,
          }),
          update: jest.fn().mockResolvedValue({
            id: 'map-1',
            tenantId,
            purpose: AccountMappingPurpose.PURCHASE_EXPENSE,
            externalRefId: '',
            accountId: apAccount.id,
            account: apAccount,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        },
      });

      const result = await service.update(actor, 'map-1', { accountId: apAccount.id });
      expect(result.accountId).toBe(apAccount.id);
      expect(prisma.accountMapping.update).toHaveBeenCalled();
    });

    it('removes a mapping', async () => {
      const { service, prisma } = buildService({
        accountMapping: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'map-1',
            tenantId,
            purpose: AccountMappingPurpose.PURCHASE_EXPENSE,
            externalRefId: '',
            accountId: expenseAccount.id,
          }),
          delete: jest.fn().mockResolvedValue({
            id: 'map-1',
            purpose: AccountMappingPurpose.PURCHASE_EXPENSE,
            externalRefId: '',
          }),
        },
      });

      const result = await service.remove(actor, 'map-1');
      expect(result).toEqual({ success: true, id: 'map-1' });
      expect(prisma.accountMapping.delete).toHaveBeenCalledWith({ where: { id: 'map-1' } });
    });
  });

  describe('resolve', () => {
    it('resolves a configured tenant-wide singleton', async () => {
      const { service } = buildService({
        accountMapping: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'map-1',
            account: { ...apAccount, isActive: true },
          }),
        },
      });

      const account = await service.resolve(actor, AccountMappingPurpose.ACCOUNTS_PAYABLE);
      expect(account.id).toBe(apAccount.id);
    });

    it('resolves a per-entity PAYMENT_METHOD mapping by externalRefId', async () => {
      const { service, prisma } = buildService({
        accountMapping: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'map-2',
            account: { ...apAccount, isActive: true },
          }),
        },
      });

      await service.resolve(actor, AccountMappingPurpose.PAYMENT_METHOD, 'pm-bank-1');
      expect(prisma.accountMapping.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId, purpose: AccountMappingPurpose.PAYMENT_METHOD, externalRefId: 'pm-bank-1' },
        }),
      );
    });

    it('never falls back — an unmapped purpose/entity throws instead of guessing an account', async () => {
      const { service } = buildService({
        accountMapping: { findFirst: jest.fn().mockResolvedValue(null) },
      });

      await expect(
        service.resolve(actor, AccountMappingPurpose.PAYMENT_METHOD, 'pm-unmapped'),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.resolve(actor, AccountMappingPurpose.INPUT_TAX),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('Sales Accounting Integration purposes', () => {
    const revenueAccount = {
      id: 'acc-revenue',
      tenantId,
      code: '4000',
      name: 'Sales Revenue',
      isActive: true,
    };
    const arAccount = {
      id: 'acc-ar',
      tenantId,
      code: '1200',
      name: 'Accounts Receivable',
      isActive: true,
    };

    function buildServiceWithSalesAccounts(
      overrides: {
        accountMapping?: Partial<Record<string, jest.Mock>>;
        account?: Partial<Record<string, jest.Mock>>;
      } = {},
    ) {
      return buildService({
        ...overrides,
        account: {
          findFirst: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
            if (where.id === revenueAccount.id) return Promise.resolve(revenueAccount);
            if (where.id === arAccount.id) return Promise.resolve(arAccount);
            return Promise.resolve(null);
          }),
          ...overrides.account,
        },
      });
    }

    it.each([
      ['SALES_REVENUE', revenueAccount],
      ['ACCOUNTS_RECEIVABLE', arAccount],
      ['OUTPUT_TAX', arAccount],
    ] as const)(
      'accepts %s as a new tenant-wide singleton purpose, created at externalRefId = ""',
      async (purpose, account) => {
        const { service, prisma } = buildServiceWithSalesAccounts({
          accountMapping: {
            create: jest.fn().mockResolvedValue({
              id: 'map-sales-1',
              tenantId,
              purpose: purpose as AccountMappingPurpose,
              externalRefId: '',
              accountId: account.id,
              account,
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
          },
        });

        const result = await service.create(actor, { purpose, accountId: account.id });

        expect(result.purpose).toBe(purpose);
        expect(result.externalRefId).toBe('');
        expect(prisma.accountMapping.create).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ purpose, externalRefId: '' }) }),
        );
      },
    );

    it.each(['SALES_REVENUE', 'ACCOUNTS_RECEIVABLE', 'OUTPUT_TAX'] as const)(
      'rejects %s (a singleton purpose) when externalRefId is supplied — singleton validation extends to the new Sales purposes',
      async (purpose) => {
        const { service } = buildServiceWithSalesAccounts();
        await expect(
          service.create(actor, {
            purpose,
            externalRefId: 'should-not-be-here',
            accountId: arAccount.id,
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
      },
    );

    it('PAYMENT_METHOD remains a shared, per-entity purpose — unaffected by adding the Sales purposes', async () => {
      const { service } = buildServiceWithSalesAccounts();
      await expect(
        service.create(actor, { purpose: 'PAYMENT_METHOD', accountId: arAccount.id }),
      ).rejects.toBeInstanceOf(BadRequestException); // still requires externalRefId
    });

    it.each(['SALES_REVENUE', 'ACCOUNTS_RECEIVABLE', 'OUTPUT_TAX'] as const)(
      'resolve() resolves a configured %s mapping (role resolution)',
      async (purpose) => {
        const { service, prisma } = buildServiceWithSalesAccounts({
          accountMapping: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'map-sales-2',
              account: { ...arAccount, isActive: true },
            }),
          },
        });

        const account = await service.resolve(actor, purpose as AccountMappingPurpose);

        expect(account.id).toBe(arAccount.id);
        expect(prisma.accountMapping.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({ where: { tenantId, purpose, externalRefId: '' } }),
        );
      },
    );

    it('resolve() is tenant-scoped: every lookup filters by the caller\'s own tenantId, never a cross-tenant mapping', async () => {
      const otherTenantActor = { userId: 'other-user', tenantId: 'zzzzzzzz-zzzz-4zzz-8zzz-zzzzzzzzzzzz' };
      const findFirst = jest.fn().mockResolvedValue(null);
      const { service } = buildServiceWithSalesAccounts({ accountMapping: { findFirst } });

      await expect(
        service.resolve(otherTenantActor, AccountMappingPurpose.SALES_REVENUE),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: otherTenantActor.tenantId, purpose: AccountMappingPurpose.SALES_REVENUE, externalRefId: '' },
        }),
      );
      // Never queried with the OTHER (actor's) tenantId — each tenant only ever resolves its own mapping.
      expect(findFirst).not.toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId }) }),
      );
    });

    it('list() scopes SALES_REVENUE/ACCOUNTS_RECEIVABLE/OUTPUT_TAX mappings to the caller tenant, same as every other purpose', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const { service } = buildServiceWithSalesAccounts({ accountMapping: { findMany } });

      await service.list(actor);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId } }),
      );
    });
  });
});
