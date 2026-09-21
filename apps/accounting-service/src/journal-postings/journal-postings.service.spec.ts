import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma-client';
import { JournalPostingsService } from './journal-postings.service';

describe('JournalPostingsService', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const actor = { userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', tenantId };

  const expenseAccount = { id: 'acc-expense', code: '5000', name: 'Purchases', isActive: true };
  const apAccount = { id: 'acc-ap', code: '2000', name: 'Accounts Payable', isActive: true };
  const bankAccount = { id: 'acc-bank', code: '1000', name: 'Bank', isActive: true };
  const inactiveAccount = { id: 'acc-inactive', code: '9999', name: 'Old', isActive: false };
  const revenueAccount = { id: 'acc-revenue', code: '4000', name: 'Sales Revenue', isActive: true };
  const arAccount = { id: 'acc-ar', code: '1200', name: 'Accounts Receivable', isActive: true };

  function decimal(value: string) {
    return new Prisma.Decimal(value);
  }

  function makeEntryRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'je-1',
      tenantId,
      entryNumber: 'JE-00000001',
      entryDate: new Date('2026-01-01'),
      description: null,
      status: 'POSTED',
      postedAt: new Date('2026-01-01'),
      sourceService: 'purchase-service',
      sourceType: 'PURCHASE_INVOICE',
      sourceId: 'inv-1',
      reversesJournalEntryId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lines: [
        {
          id: 'l1',
          lineNumber: 1,
          accountId: expenseAccount.id,
          account: expenseAccount,
          debitAmount: decimal('100.0000'),
          creditAmount: decimal('0'),
          description: null,
        },
        {
          id: 'l2',
          lineNumber: 2,
          accountId: apAccount.id,
          account: apAccount,
          debitAmount: decimal('0'),
          creditAmount: decimal('100.0000'),
          description: null,
        },
      ],
      ...overrides,
    };
  }

  function buildService(
    overrides: {
      journalEntry?: Partial<Record<string, jest.Mock>>;
      resolve?: jest.Mock;
    } = {},
  ) {
    const prisma = {
      journalEntry: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        ...overrides.journalEntry,
      },
    };

    const accountsByRole: Record<string, { id: string; code: string; name: string; isActive: boolean }> = {
      PURCHASE_EXPENSE: expenseAccount,
      ACCOUNTS_PAYABLE: apAccount,
      INPUT_TAX: expenseAccount,
      PAYMENT_METHOD: bankAccount,
      SALES_REVENUE: revenueAccount,
      ACCOUNTS_RECEIVABLE: arAccount,
      OUTPUT_TAX: revenueAccount,
    };
    const mappings = {
      resolve:
        overrides.resolve ??
        jest.fn().mockImplementation((_actor, purpose: string) => {
          const account = accountsByRole[purpose];
          if (!account) {
            return Promise.reject(new BadRequestException(`No account mapping configured for ${purpose}`));
          }
          return Promise.resolve(account);
        }),
    };

    const service = new JournalPostingsService(prisma as never, mappings as never);
    return { service, prisma, mappings };
  }

  const balancedLines = () => [
    { role: 'PURCHASE_EXPENSE' as const, side: 'DEBIT' as const, amount: '100.0000' },
    { role: 'ACCOUNTS_PAYABLE' as const, side: 'CREDIT' as const, amount: '100.0000' },
  ];

  describe('create', () => {
    it('posts a new, balanced journal entry directly as POSTED', async () => {
      const { service, prisma } = buildService({
        journalEntry: { create: jest.fn().mockResolvedValue(makeEntryRow()) },
      });

      const result = await service.create(actor, {
        sourceService: 'purchase-service',
        sourceType: 'PURCHASE_INVOICE',
        sourceId: 'inv-1',
        lines: balancedLines(),
      });

      expect(result.status).toBe('POSTED');
      expect(result.idempotentReplay).toBe(false);
      const data = (prisma.journalEntry.create as jest.Mock).mock.calls[0][0].data;
      expect(data.status).toBe('POSTED');
      expect(data.sourceService).toBe('purchase-service');
      expect(data.sourceType).toBe('PURCHASE_INVOICE');
      expect(data.sourceId).toBe('inv-1');
    });

    it('is idempotent: a repeated call for the same source returns the existing entry without creating a second one', async () => {
      const { service, prisma } = buildService({
        journalEntry: { findFirst: jest.fn().mockResolvedValue(makeEntryRow()) },
      });

      const result = await service.create(actor, {
        sourceService: 'purchase-service',
        sourceType: 'PURCHASE_INVOICE',
        sourceId: 'inv-1',
        lines: balancedLines(),
      });

      expect(result.idempotentReplay).toBe(true);
      expect(result.id).toBe('je-1');
      expect(prisma.journalEntry.create).not.toHaveBeenCalled();
    });

    it('rejects an unbalanced set of lines', async () => {
      const { service, prisma } = buildService();
      await expect(
        service.create(actor, {
          sourceService: 'purchase-service',
          sourceType: 'PURCHASE_INVOICE',
          sourceId: 'inv-1',
          lines: [
            { role: 'PURCHASE_EXPENSE', side: 'DEBIT', amount: '100.0000' },
            { role: 'ACCOUNTS_PAYABLE', side: 'CREDIT', amount: '90.0000' },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.journalEntry.create).not.toHaveBeenCalled();
    });

    it('rejects when a resolved account is inactive', async () => {
      const { service } = buildService({
        resolve: jest.fn().mockImplementation((_actor, purpose: string) =>
          Promise.resolve(purpose === 'PURCHASE_EXPENSE' ? inactiveAccount : apAccount),
        ),
      });
      await expect(
        service.create(actor, {
          sourceService: 'purchase-service',
          sourceType: 'PURCHASE_INVOICE',
          sourceId: 'inv-1',
          lines: balancedLines(),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a PAYMENT_METHOD line with no paymentMethodId', async () => {
      const { service } = buildService();
      await expect(
        service.create(actor, {
          sourceService: 'purchase-service',
          sourceType: 'SUPPLIER_PAYMENT',
          sourceId: 'pay-1',
          lines: [
            { role: 'ACCOUNTS_PAYABLE', side: 'DEBIT', amount: '50.0000' },
            { role: 'PAYMENT_METHOD', side: 'CREDIT', amount: '50.0000' },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('propagates the mapping resolution error for an unmapped role — never fabricates an account', async () => {
      const { service, prisma } = buildService({
        resolve: jest.fn().mockRejectedValue(
          new BadRequestException('No account mapping configured for PAYMENT_METHOD for "pm-unmapped"'),
        ),
      });
      await expect(
        service.create(actor, {
          sourceService: 'purchase-service',
          sourceType: 'SUPPLIER_PAYMENT',
          sourceId: 'pay-1',
          lines: [
            { role: 'ACCOUNTS_PAYABLE', side: 'DEBIT', amount: '50.0000' },
            { role: 'PAYMENT_METHOD', side: 'CREDIT', amount: '50.0000', paymentMethodId: 'pm-unmapped' },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.journalEntry.create).not.toHaveBeenCalled();
    });

    it('recovers from a concurrent duplicate-source race by replaying the winner, never creating a second entry', async () => {
      const raceConflict = Object.assign(new Error('duplicate'), {
        code: 'P2002',
        meta: { target: ['tenantId', 'sourceService', 'sourceType', 'sourceId'] },
      });
      const findFirst = jest
        .fn()
        .mockResolvedValueOnce(null) // pre-check: not yet posted
        .mockResolvedValueOnce(makeEntryRow()); // re-fetch after losing the race
      const { service, prisma } = buildService({
        journalEntry: {
          findFirst,
          create: jest.fn().mockRejectedValue(raceConflict),
        },
      });

      const result = await service.create(actor, {
        sourceService: 'purchase-service',
        sourceType: 'PURCHASE_INVOICE',
        sourceId: 'inv-1',
        lines: balancedLines(),
      });

      expect(result.idempotentReplay).toBe(true);
      expect(prisma.journalEntry.create).toHaveBeenCalledTimes(1);
    });

    it('retries with a new entry number on an entryNumber collision (unrelated to the source-uniqueness constraint)', async () => {
      const numberConflict = Object.assign(new Error('duplicate'), {
        code: 'P2002',
        meta: { target: ['tenantId', 'entryNumber'] },
      });
      const create = jest
        .fn()
        .mockRejectedValueOnce(numberConflict)
        .mockResolvedValueOnce(makeEntryRow({ entryNumber: 'JE-00000002' }));
      const { service, prisma } = buildService({ journalEntry: { create } });

      const result = await service.create(actor, {
        sourceService: 'purchase-service',
        sourceType: 'PURCHASE_INVOICE',
        sourceId: 'inv-1',
        lines: balancedLines(),
      });

      expect(create).toHaveBeenCalledTimes(2);
      expect(result.idempotentReplay).toBe(false);
      expect(prisma.journalEntry.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('reverse', () => {
    it('rejects when there is no posted journal entry for the given source reference', async () => {
      const { service } = buildService({
        journalEntry: { findFirst: jest.fn().mockResolvedValue(null) },
      });
      await expect(
        service.reverse(actor, {
          sourceService: 'purchase-service',
          sourceType: 'PURCHASE_INVOICE',
          sourceId: 'inv-1',
          reversalSourceType: 'PURCHASE_INVOICE_CANCELLATION',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('creates a POSTED reversal entry with debit/credit swapped, linked via reversesJournalEntryId — original is never updated', async () => {
      const original = makeEntryRow();
      const findFirst = jest
        .fn()
        .mockResolvedValueOnce(original) // lookup of the original by its source
        .mockResolvedValueOnce(null); // idempotency pre-check for the reversal's own source
      const create = jest.fn().mockResolvedValue(
        makeEntryRow({
          id: 'je-2',
          sourceType: 'PURCHASE_INVOICE_CANCELLATION',
          reversesJournalEntryId: 'je-1',
          lines: [
            { ...original.lines[0], debitAmount: decimal('0'), creditAmount: decimal('100.0000') },
            { ...original.lines[1], debitAmount: decimal('100.0000'), creditAmount: decimal('0') },
          ],
        }),
      );
      const { service, prisma } = buildService({ journalEntry: { findFirst, create } });

      const result = await service.reverse(actor, {
        sourceService: 'purchase-service',
        sourceType: 'PURCHASE_INVOICE',
        sourceId: 'inv-1',
        reversalSourceType: 'PURCHASE_INVOICE_CANCELLATION',
      });

      expect(result.reversesJournalEntryId).toBe('je-1');
      const data = (prisma.journalEntry.create as jest.Mock).mock.calls[0][0].data;
      expect(data.reversesJournalEntryId).toBe('je-1');
      expect(data.sourceType).toBe('PURCHASE_INVOICE_CANCELLATION');
      expect(data.lines.create[0]).toEqual(
        expect.objectContaining({ debitAmount: decimal('0'), creditAmount: decimal('100.0000') }),
      );
      expect(data.lines.create[1]).toEqual(
        expect.objectContaining({ debitAmount: decimal('100.0000'), creditAmount: decimal('0') }),
      );
      // The original entry is looked up read-only — no update/status-change call exists anywhere
      // in the service, so there is nothing to assert against here beyond confirming `update`
      // was never part of the mocked surface the service actually touched.
      expect(prisma.journalEntry).not.toHaveProperty('update');
    });

    it('is idempotent: a repeated reversal call for the same source returns the existing reversal, never creating a second one', async () => {
      const original = makeEntryRow();
      const existingReversal = makeEntryRow({
        id: 'je-2',
        sourceType: 'PURCHASE_INVOICE_CANCELLATION',
        reversesJournalEntryId: 'je-1',
      });
      const findFirst = jest
        .fn()
        .mockResolvedValueOnce(original)
        .mockResolvedValueOnce(existingReversal);
      const { service, prisma } = buildService({ journalEntry: { findFirst } });

      const result = await service.reverse(actor, {
        sourceService: 'purchase-service',
        sourceType: 'PURCHASE_INVOICE',
        sourceId: 'inv-1',
        reversalSourceType: 'PURCHASE_INVOICE_CANCELLATION',
      });

      expect(result.idempotentReplay).toBe(true);
      expect(result.id).toBe('je-2');
      expect(prisma.journalEntry.create).not.toHaveBeenCalled();
    });
  });

  describe('Sales Accounting Integration roles', () => {
    it('posts a balanced Sales Invoice entry using the new SALES_REVENUE/ACCOUNTS_RECEIVABLE/OUTPUT_TAX roles (role resolution + balanced posting)', async () => {
      const { service, prisma, mappings } = buildService({
        journalEntry: {
          create: jest.fn().mockResolvedValue(
            makeEntryRow({
              sourceService: 'sales-service',
              sourceType: 'SALES_INVOICE',
              sourceId: 'sinv-1',
              lines: [
                { id: 'l1', lineNumber: 1, accountId: revenueAccount.id, account: revenueAccount, debitAmount: decimal('0'), creditAmount: decimal('100.0000'), description: null },
                { id: 'l2', lineNumber: 2, accountId: revenueAccount.id, account: revenueAccount, debitAmount: decimal('0'), creditAmount: decimal('18.0000'), description: null },
                { id: 'l3', lineNumber: 3, accountId: arAccount.id, account: arAccount, debitAmount: decimal('118.0000'), creditAmount: decimal('0'), description: null },
              ],
            }),
          ),
        },
      });

      const result = await service.create(actor, {
        sourceService: 'sales-service',
        sourceType: 'SALES_INVOICE',
        sourceId: 'sinv-1',
        lines: [
          { role: 'SALES_REVENUE', side: 'CREDIT', amount: '100.0000' },
          { role: 'OUTPUT_TAX', side: 'CREDIT', amount: '18.0000' },
          { role: 'ACCOUNTS_RECEIVABLE', side: 'DEBIT', amount: '118.0000' },
        ],
      });

      expect(result.status).toBe('POSTED');
      expect(mappings.resolve).toHaveBeenCalledWith(actor, 'SALES_REVENUE', '');
      expect(mappings.resolve).toHaveBeenCalledWith(actor, 'OUTPUT_TAX', '');
      expect(mappings.resolve).toHaveBeenCalledWith(actor, 'ACCOUNTS_RECEIVABLE', '');
      const data = (prisma.journalEntry.create as jest.Mock).mock.calls[0][0].data;
      expect(data.lines.create).toHaveLength(3);
      const totalDebit = data.lines.create.reduce(
        (sum: Prisma.Decimal, l: { debitAmount: Prisma.Decimal }) => sum.plus(l.debitAmount),
        decimal('0'),
      );
      const totalCredit = data.lines.create.reduce(
        (sum: Prisma.Decimal, l: { creditAmount: Prisma.Decimal }) => sum.plus(l.creditAmount),
        decimal('0'),
      );
      expect(totalDebit.equals(totalCredit)).toBe(true);
    });

    it('posts a balanced Customer Payment entry: Dr PAYMENT_METHOD / Cr ACCOUNTS_RECEIVABLE', async () => {
      const { service, prisma } = buildService({
        journalEntry: {
          create: jest.fn().mockResolvedValue(
            makeEntryRow({
              sourceService: 'sales-service',
              sourceType: 'CUSTOMER_PAYMENT',
              sourceId: 'pay-1',
            }),
          ),
        },
      });

      await service.create(actor, {
        sourceService: 'sales-service',
        sourceType: 'CUSTOMER_PAYMENT',
        sourceId: 'pay-1',
        lines: [
          { role: 'PAYMENT_METHOD', side: 'DEBIT', amount: '40.0000', paymentMethodId: 'pm-1' },
          { role: 'ACCOUNTS_RECEIVABLE', side: 'CREDIT', amount: '40.0000' },
        ],
      });

      const data = (prisma.journalEntry.create as jest.Mock).mock.calls[0][0].data;
      expect(data.sourceType).toBe('CUSTOMER_PAYMENT');
      expect(data.lines.create).toHaveLength(2);
    });

    it('rejects an unbalanced Sales-role posting the same way as any other role', async () => {
      const { service, prisma } = buildService();
      await expect(
        service.create(actor, {
          sourceService: 'sales-service',
          sourceType: 'SALES_INVOICE',
          sourceId: 'sinv-2',
          lines: [
            { role: 'SALES_REVENUE', side: 'CREDIT', amount: '100.0000' },
            { role: 'ACCOUNTS_RECEIVABLE', side: 'DEBIT', amount: '90.0000' },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.journalEntry.create).not.toHaveBeenCalled();
    });

    it('propagates the mapping resolution error for an unmapped Sales role — never fabricates an account', async () => {
      const { service } = buildService({
        resolve: jest.fn().mockRejectedValue(new BadRequestException('No account mapping configured for SALES_REVENUE')),
      });

      await expect(
        service.create(actor, {
          sourceService: 'sales-service',
          sourceType: 'SALES_INVOICE',
          sourceId: 'sinv-3',
          lines: [
            { role: 'SALES_REVENUE', side: 'CREDIT', amount: '100.0000' },
            { role: 'ACCOUNTS_RECEIVABLE', side: 'DEBIT', amount: '100.0000' },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
