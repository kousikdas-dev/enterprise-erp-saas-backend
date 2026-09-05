import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { TaxComponentType } from '../../generated/prisma-client';
import { TaxCodesService } from './tax-codes.service';

describe('TaxCodesService', () => {
  const actor = {
    userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    tenantId: '11111111-1111-4111-8111-111111111111',
  };
  const otherTenantId = '22222222-2222-4222-8222-222222222222';

  const revenueAccount = { id: 'acc-revenue', code: '4000', name: 'Revenue' };

  const baseRow = {
    id: 'tc-1',
    tenantId: actor.tenantId,
    code: 'GST18_LOCAL',
    name: 'GST 18% Local',
    description: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    components: [
      {
        id: 'comp-1',
        tenantId: actor.tenantId,
        taxCodeId: 'tc-1',
        sequence: 1,
        type: TaxComponentType.CGST,
        name: null,
        rate: { toFixed: () => '9.0000' },
        accountId: null,
        account: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'comp-2',
        tenantId: actor.tenantId,
        taxCodeId: 'tc-1',
        sequence: 2,
        type: TaxComponentType.SGST,
        name: null,
        rate: { toFixed: () => '9.0000' },
        accountId: null,
        account: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  };

  const validComponentDtos = () => [
    { sequence: 1, type: TaxComponentType.CGST, rate: '9' },
    { sequence: 2, type: TaxComponentType.SGST, rate: '9' },
  ];

  function buildService(
    overrides: {
      taxCode?: Partial<Record<string, jest.Mock>>;
      taxComponent?: Partial<Record<string, jest.Mock>>;
      accounts?: { require: jest.Mock };
    } = {},
  ) {
    const prisma = {
      taxCode: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        ...overrides.taxCode,
      },
      taxComponent: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
        ...overrides.taxComponent,
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (fn: (client: typeof prisma) => Promise<unknown>) => fn(prisma),
    );

    const accounts = overrides.accounts ?? {
      require: jest.fn().mockImplementation((_actor, id: string) => {
        if (id === revenueAccount.id) return Promise.resolve(revenueAccount);
        return Promise.reject(new NotFoundException('Account not found'));
      }),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };

    const service = new TaxCodesService(
      prisma as never,
      accounts as never,
      audit as never,
    );

    return { service, prisma, accounts, audit };
  }

  describe('create', () => {
    it('creates a tax code with CGST + SGST components and audits', async () => {
      const { service, prisma, audit } = buildService({
        taxCode: { create: jest.fn().mockResolvedValue(baseRow) },
      });

      const result = await service.create(actor, {
        code: 'gst18_local',
        name: 'GST 18% Local',
        components: validComponentDtos(),
      } as never);

      expect(prisma.taxCode.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: actor.tenantId,
            code: 'GST18_LOCAL',
          }),
        }),
      );
      expect(result.code).toBe('GST18_LOCAL');
      expect(result.components).toHaveLength(2);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'tax-code.created' }),
      );
    });

    it('creates an interstate tax code with only IGST', async () => {
      const igstRow = {
        ...baseRow,
        components: [
          {
            ...baseRow.components[0],
            type: TaxComponentType.IGST,
            sequence: 1,
          },
        ],
      };
      const { service, prisma } = buildService({
        taxCode: { create: jest.fn().mockResolvedValue(igstRow) },
      });

      await service.create(actor, {
        code: 'GST18_INTERSTATE',
        name: 'GST 18% Interstate',
        components: [{ sequence: 1, type: TaxComponentType.IGST, rate: '18' }],
      } as never);

      expect(prisma.taxCode.create).toHaveBeenCalled();
    });

    it('maps a unique violation to ConflictException', async () => {
      const { service } = buildService({
        taxCode: { create: jest.fn().mockRejectedValue({ code: 'P2002' }) },
      });

      await expect(
        service.create(actor, {
          code: 'GST18_LOCAL',
          name: 'GST 18% Local',
          components: validComponentDtos(),
        } as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a duplicate CGST component within the same tax code', async () => {
      const { service, prisma } = buildService();

      await expect(
        service.create(actor, {
          code: 'X',
          name: 'X',
          components: [
            { sequence: 1, type: TaxComponentType.CGST, rate: '9' },
            { sequence: 2, type: TaxComponentType.CGST, rate: '9' },
          ],
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.taxCode.create).not.toHaveBeenCalled();
    });

    it('allows two CESS components in the same tax code', async () => {
      const { service, prisma } = buildService({
        taxCode: { create: jest.fn().mockResolvedValue(baseRow) },
      });

      await service.create(actor, {
        code: 'X',
        name: 'X',
        components: [
          { sequence: 1, type: TaxComponentType.CESS, name: 'Cess A', rate: '1' },
          { sequence: 2, type: TaxComponentType.CESS, name: 'Cess B', rate: '2' },
        ],
      } as never);

      expect(prisma.taxCode.create).toHaveBeenCalled();
    });

    it('rejects IGST combined with CGST in the same tax code', async () => {
      const { service, prisma } = buildService();

      await expect(
        service.create(actor, {
          code: 'X',
          name: 'X',
          components: [
            { sequence: 1, type: TaxComponentType.IGST, rate: '18' },
            { sequence: 2, type: TaxComponentType.CGST, rate: '9' },
          ],
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.taxCode.create).not.toHaveBeenCalled();
    });

    it('rejects IGST combined with SGST in the same tax code', async () => {
      const { service } = buildService();

      await expect(
        service.create(actor, {
          code: 'X',
          name: 'X',
          components: [
            { sequence: 1, type: TaxComponentType.IGST, rate: '18' },
            { sequence: 2, type: TaxComponentType.SGST, rate: '9' },
          ],
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('validates an optional component accountId against AccountsService', async () => {
      const { service, prisma, accounts } = buildService({
        taxCode: { create: jest.fn().mockResolvedValue(baseRow) },
      });

      await service.create(actor, {
        code: 'X',
        name: 'X',
        components: [
          {
            sequence: 1,
            type: TaxComponentType.CGST,
            rate: '9',
            accountId: revenueAccount.id,
          },
        ],
      } as never);

      expect(accounts.require).toHaveBeenCalledWith(actor, revenueAccount.id);
      expect(prisma.taxCode.create).toHaveBeenCalled();
    });

    it('rejects a component referencing a nonexistent account', async () => {
      const { service, prisma } = buildService();

      await expect(
        service.create(actor, {
          code: 'X',
          name: 'X',
          components: [
            {
              sequence: 1,
              type: TaxComponentType.CGST,
              rate: '9',
              accountId: 'missing',
            },
          ],
        } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.taxCode.create).not.toHaveBeenCalled();
    });

    it('rejects a component account belonging to another tenant, using the same safe message', async () => {
      // AccountsService.require() already returns the identical NotFoundException
      // for "does not exist" and "exists but in another tenant" — reused as-is,
      // so a cross-tenant account is rejected without confirming its existence.
      const { service, prisma, accounts } = buildService();
      accounts.require.mockRejectedValue(
        new NotFoundException('Account not found'),
      );

      await expect(
        service.create(actor, {
          code: 'X',
          name: 'X',
          components: [
            {
              sequence: 1,
              type: TaxComponentType.CGST,
              rate: '9',
              accountId: 'other-tenant-account',
            },
          ],
        } as never),
      ).rejects.toThrow('Account not found');
      expect(prisma.taxCode.create).not.toHaveBeenCalled();
    });

    it('rejects duplicate sequence numbers within the same tax code', async () => {
      const { service, prisma } = buildService();

      await expect(
        service.create(actor, {
          code: 'X',
          name: 'X',
          components: [
            { sequence: 1, type: TaxComponentType.CGST, rate: '9' },
            { sequence: 1, type: TaxComponentType.SGST, rate: '9' },
          ],
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.taxCode.create).not.toHaveBeenCalled();
    });

    it('rejects a rate above 100', async () => {
      const { service, prisma } = buildService();

      await expect(
        service.create(actor, {
          code: 'X',
          name: 'X',
          components: [
            { sequence: 1, type: TaxComponentType.CGST, rate: '101' },
          ],
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.taxCode.create).not.toHaveBeenCalled();
    });

    it('accepts a rate of exactly 100', async () => {
      const { service, prisma } = buildService({
        taxCode: { create: jest.fn().mockResolvedValue(baseRow) },
      });

      await service.create(actor, {
        code: 'X',
        name: 'X',
        components: [{ sequence: 1, type: TaxComponentType.CESS, rate: '100' }],
      } as never);

      expect(prisma.taxCode.create).toHaveBeenCalled();
    });

    it('rejects a rate with more than 4 decimal places', async () => {
      const { service } = buildService();

      await expect(
        service.create(actor, {
          code: 'X',
          name: 'X',
          components: [
            { sequence: 1, type: TaxComponentType.CGST, rate: '9.12345' },
          ],
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a negative rate', async () => {
      const { service } = buildService();

      await expect(
        service.create(actor, {
          code: 'X',
          name: 'X',
          components: [
            { sequence: 1, type: TaxComponentType.CGST, rate: '-9' },
          ],
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('list', () => {
    it('scopes results to the actor tenant', async () => {
      const { service, prisma } = buildService({
        taxCode: { findMany: jest.fn().mockResolvedValue([baseRow]) },
      });

      const result = await service.list(actor);

      expect(prisma.taxCode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: actor.tenantId } }),
      );
      expect(result.items).toHaveLength(1);
    });
  });

  describe('getById', () => {
    it('returns the tax code when it belongs to the tenant', async () => {
      const { service } = buildService({
        taxCode: { findFirst: jest.fn().mockResolvedValue(baseRow) },
      });

      const result = await service.getById(actor, baseRow.id);
      expect(result.id).toBe(baseRow.id);
    });

    it('throws NotFoundException for a different tenant (tenant isolation)', async () => {
      const { service, prisma } = buildService({
        taxCode: { findFirst: jest.fn().mockResolvedValue(null) },
      });

      await expect(
        service.getById({ ...actor, tenantId: otherTenantId }, baseRow.id),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.taxCode.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: baseRow.id, tenantId: otherTenantId },
        }),
      );
    });
  });

  describe('update', () => {
    it('updates header fields only, leaving components untouched', async () => {
      const updated = { ...baseRow, name: 'GST 18% Local Updated' };
      const findFirst = jest
        .fn()
        .mockResolvedValueOnce(baseRow) // require() at start of update()
        .mockResolvedValueOnce(updated); // re-fetch inside the transaction
      const { service, prisma } = buildService({
        taxCode: { findFirst, update: jest.fn().mockResolvedValue(updated) },
      });

      const result = await service.update(actor, baseRow.id, {
        name: 'GST 18% Local Updated',
      });

      expect(result.name).toBe('GST 18% Local Updated');
      expect(prisma.taxCode.update).toHaveBeenCalledWith({
        where: { id: baseRow.id },
        data: { name: 'GST 18% Local Updated' },
      });
      expect(prisma.taxComponent.deleteMany).not.toHaveBeenCalled();
      expect(prisma.taxComponent.createMany).not.toHaveBeenCalled();
    });

    it('replaces the entire component set when components is provided', async () => {
      const findFirst = jest
        .fn()
        .mockResolvedValueOnce(baseRow)
        .mockResolvedValueOnce(baseRow);
      const { service, prisma } = buildService({
        taxCode: { findFirst },
      });

      await service.update(actor, baseRow.id, {
        components: [{ sequence: 1, type: TaxComponentType.IGST, rate: '18' }],
      });

      expect(prisma.taxCode.update).not.toHaveBeenCalled();
      expect(prisma.taxComponent.deleteMany).toHaveBeenCalledWith({
        where: { taxCodeId: baseRow.id, tenantId: actor.tenantId },
      });
      expect(prisma.taxComponent.createMany).toHaveBeenCalled();
    });

    it("tenant isolation prevents updating another tenant's tax code", async () => {
      const findFirst = jest.fn().mockResolvedValue(null);
      const { service, prisma } = buildService({
        taxCode: { findFirst },
      });

      await expect(
        service.update({ ...actor, tenantId: otherTenantId }, baseRow.id, {
          name: 'X',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.taxCode.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: baseRow.id, tenantId: otherTenantId },
        }),
      );
      expect(prisma.taxCode.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the tax code is not in this tenant', async () => {
      const { service } = buildService({
        taxCode: { findFirst: jest.fn().mockResolvedValue(null) },
      });

      await expect(
        service.update(actor, 'missing', { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when no fields are provided', async () => {
      const { service } = buildService({
        taxCode: { findFirst: jest.fn().mockResolvedValue(baseRow) },
      });

      await expect(
        service.update(actor, baseRow.id, {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('maps a unique violation on update to ConflictException', async () => {
      const { service } = buildService({
        taxCode: {
          findFirst: jest.fn().mockResolvedValue(baseRow),
          update: jest.fn().mockRejectedValue({ code: 'P2002' }),
        },
      });

      await expect(
        service.update(actor, baseRow.id, { code: 'OTHER' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a replacement component set with duplicate sequence numbers', async () => {
      const { service, prisma } = buildService({
        taxCode: { findFirst: jest.fn().mockResolvedValue(baseRow) },
      });

      await expect(
        service.update(actor, baseRow.id, {
          components: [
            { sequence: 1, type: TaxComponentType.CGST, rate: '9' },
            { sequence: 1, type: TaxComponentType.SGST, rate: '9' },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.taxComponent.deleteMany).not.toHaveBeenCalled();
    });

    it('rejects a replacement component referencing a cross-tenant account', async () => {
      const { service, prisma, accounts } = buildService({
        taxCode: { findFirst: jest.fn().mockResolvedValue(baseRow) },
      });
      accounts.require.mockRejectedValue(
        new NotFoundException('Account not found'),
      );

      await expect(
        service.update(actor, baseRow.id, {
          components: [
            {
              sequence: 1,
              type: TaxComponentType.CGST,
              rate: '9',
              accountId: 'other-tenant-account',
            },
          ],
        }),
      ).rejects.toThrow('Account not found');
      expect(prisma.taxComponent.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('activates and deactivates a tax code, recording the transition', async () => {
      const { service, prisma, audit } = buildService({
        taxCode: {
          findFirst: jest.fn().mockResolvedValue({ ...baseRow, isActive: true }),
          update: jest.fn().mockResolvedValue({ ...baseRow, isActive: false }),
        },
      });

      const result = await service.updateStatus(actor, baseRow.id, {
        isActive: false,
      });

      expect(prisma.taxCode.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } }),
      );
      expect(result.isActive).toBe(false);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'tax-code.status_changed',
          metadata: { from: true, to: false },
        }),
      );
    });

    it('throws NotFoundException for a tax code outside the tenant', async () => {
      const { service } = buildService({
        taxCode: { findFirst: jest.fn().mockResolvedValue(null) },
      });

      await expect(
        service.updateStatus(actor, 'missing', { isActive: false }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
