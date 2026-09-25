import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma-client';
import { AccountingLedgerClient } from '../accounting/accounting-ledger.client';
import { AccountsPayableService } from './accounts-payable.service';

describe('AccountsPayableService', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const supplierId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  function decimal(v: string) {
    return new Prisma.Decimal(v);
  }

  function buildService(overrides: {
    purchaseInvoice?: Record<string, jest.Mock>;
    supplier?: Record<string, jest.Mock>;
    supplierPayment?: Record<string, jest.Mock>;
    queryRaw?: jest.Mock;
    ledgerClient?: Partial<AccountingLedgerClient>;
  } = {}) {
    const prisma = {
      purchaseInvoice: {
        groupBy: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { total: null, amountPaid: null } }),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        ...overrides.purchaseInvoice,
      },
      supplier: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        ...overrides.supplier,
      },
      supplierPayment: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
        ...overrides.supplierPayment,
      },
      $queryRaw: overrides.queryRaw ?? jest.fn().mockResolvedValue([]),
    };
    const ledgerClient = {
      findAccountsPayableMapping: jest.fn().mockResolvedValue(null),
      getAccountBalance: jest.fn().mockResolvedValue('0.0000'),
      ...overrides.ledgerClient,
    } as unknown as AccountingLedgerClient;

    const service = new AccountsPayableService(prisma as any, ledgerClient);
    return { service, prisma, ledgerClient };
  }

  describe('listSupplierSummaries', () => {
    it('returns an empty list when there are no CONFIRMED invoices', async () => {
      const { service } = buildService();
      const result = await service.listSupplierSummaries(actor, true);
      expect(result).toEqual({ items: [] });
    });

    it('excludes fully-paid suppliers when onlyOutstanding is true', async () => {
      const { service } = buildService({
        purchaseInvoice: {
          groupBy: jest.fn().mockImplementation((args: { where: Record<string, unknown> }) => {
            if ('paymentStatus' in (args.where ?? {})) {
              return Promise.resolve([{ supplierId, _count: { _all: 0 } }]);
            }
            return Promise.resolve([
              { supplierId, _sum: { total: decimal('100.0000'), amountPaid: decimal('100.0000') } },
            ]);
          }),
          aggregate: jest.fn(),
          count: jest.fn(),
          findMany: jest.fn(),
        },
        supplier: {
          findFirst: jest.fn(),
          findMany: jest.fn().mockResolvedValue([{ id: supplierId, code: 'SUP-1', name: 'Acme' }]),
        },
      });
      const result = await service.listSupplierSummaries(actor, true);
      expect(result.items).toEqual([]);
    });

    it('includes fully-paid suppliers when onlyOutstanding is false', async () => {
      const { service } = buildService({
        purchaseInvoice: {
          groupBy: jest.fn().mockImplementation((args: { where: Record<string, unknown> }) => {
            if ('paymentStatus' in (args.where ?? {})) {
              return Promise.resolve([]);
            }
            return Promise.resolve([
              { supplierId, _sum: { total: decimal('100.0000'), amountPaid: decimal('100.0000') } },
            ]);
          }),
          aggregate: jest.fn(),
          count: jest.fn(),
          findMany: jest.fn(),
        },
        supplier: {
          findFirst: jest.fn(),
          findMany: jest.fn().mockResolvedValue([{ id: supplierId, code: 'SUP-1', name: 'Acme' }]),
        },
      });
      const result = await service.listSupplierSummaries(actor, false);
      expect(result.items).toEqual([
        expect.objectContaining({
          supplierId,
          supplierCode: 'SUP-1',
          supplierName: 'Acme',
          totalInvoiced: '100.0000',
          totalPaid: '100.0000',
          totalOutstanding: '0.0000',
        }),
      ]);
    });
  });

  describe('getSupplierSummary', () => {
    it('throws NotFoundException when the supplier does not exist in this tenant', async () => {
      const { service } = buildService();
      await expect(service.getSupplierSummary(actor, supplierId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns totals for an existing supplier', async () => {
      const { service } = buildService({
        supplier: {
          findFirst: jest.fn().mockResolvedValue({ id: supplierId, code: 'SUP-1', name: 'Acme' }),
          findMany: jest.fn(),
        },
        purchaseInvoice: {
          groupBy: jest.fn(),
          aggregate: jest
            .fn()
            .mockResolvedValue({ _sum: { total: decimal('500.0000'), amountPaid: decimal('200.0000') } }),
          count: jest.fn().mockResolvedValue(2),
          findMany: jest.fn(),
        },
      });
      const result = await service.getSupplierSummary(actor, supplierId);
      expect(result).toEqual(
        expect.objectContaining({
          totalInvoiced: '500.0000',
          totalPaid: '200.0000',
          totalOutstanding: '300.0000',
          outstandingInvoiceCount: 2,
        }),
      );
    });
  });

  describe('listInvoices', () => {
    it('defaults to status CONFIRMED and omits payments when includePayments is not set', async () => {
      const findMany = jest.fn().mockResolvedValue([
        {
          id: 'inv-1',
          invoiceNumber: 'PINV-1',
          supplierInvoiceNumber: null,
          supplierId,
          supplierName: 'Acme',
          invoiceDate: new Date('2026-01-01T00:00:00.000Z'),
          dueDate: null,
          total: decimal('100.0000'),
          amountPaid: decimal('0.0000'),
          paymentStatus: 'UNPAID',
          status: 'CONFIRMED',
          payments: [{ id: 'pay-1', amount: decimal('10.0000'), paymentDate: new Date(), status: 'ACTIVE', reversedAt: null }],
        },
      ]);
      const { service } = buildService({
        purchaseInvoice: { groupBy: jest.fn(), aggregate: jest.fn(), count: jest.fn(), findMany },
      });

      const result = await service.listInvoices(actor, {});
      expect(findMany.mock.calls[0][0].where.status).toBe('CONFIRMED');
      expect(result.items[0].payments).toBeUndefined();
    });

    it('includes payments when includePayments=true', async () => {
      const findMany = jest.fn().mockResolvedValue([
        {
          id: 'inv-1',
          invoiceNumber: 'PINV-1',
          supplierInvoiceNumber: null,
          supplierId,
          supplierName: 'Acme',
          invoiceDate: new Date('2026-01-01T00:00:00.000Z'),
          dueDate: null,
          total: decimal('100.0000'),
          amountPaid: decimal('10.0000'),
          paymentStatus: 'PARTIALLY_PAID',
          status: 'CONFIRMED',
          payments: [
            { id: 'pay-1', amount: decimal('10.0000'), paymentDate: new Date('2026-01-05T00:00:00.000Z'), status: 'ACTIVE', reversedAt: null },
          ],
        },
      ]);
      const { service } = buildService({
        purchaseInvoice: { groupBy: jest.fn(), aggregate: jest.fn(), count: jest.fn(), findMany },
      });

      const result = await service.listInvoices(actor, { includePayments: 'true' } as any);
      expect(result.items[0].payments).toHaveLength(1);
      expect(result.items[0].balanceDue).toBe('90.0000');
    });

    it('applies supplierId and paymentStatus filters', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const { service } = buildService({
        purchaseInvoice: { groupBy: jest.fn(), aggregate: jest.fn(), count: jest.fn(), findMany },
      });
      await service.listInvoices(actor, { supplierId, paymentStatus: 'PAID' } as any);
      expect(findMany.mock.calls[0][0].where.supplierId).toBe(supplierId);
      expect(findMany.mock.calls[0][0].where.paymentStatus).toBe('PAID');
    });
  });

  describe('getAging', () => {
    function invoiceRow(overrides: Record<string, unknown>) {
      return {
        id: 'inv-1',
        invoiceNumber: 'PINV-1',
        supplierId,
        supplierName: 'Acme',
        invoiceDate: new Date('2026-01-01T00:00:00.000Z'),
        dueDate: null,
        total: decimal('100.0000'),
        amountPaid: decimal('0.0000'),
        ...overrides,
      };
    }

    it('uses DUE_DATE basis and buckets CURRENT when not yet due', async () => {
      const { service } = buildService({
        purchaseInvoice: {
          groupBy: jest.fn(),
          aggregate: jest.fn(),
          count: jest.fn(),
          findMany: jest.fn().mockResolvedValue([
            invoiceRow({ dueDate: new Date('2026-02-01T00:00:00.000Z') }),
          ]),
        },
      });
      const result = await service.getAging(actor, { asOfDate: '2026-01-15' } as any);
      expect(result.items[0].agingBasis).toBe('DUE_DATE');
      expect(result.items[0].bucket).toBe('CURRENT');
    });

    it('falls back to INVOICE_DATE_FALLBACK when dueDate is null', async () => {
      const { service } = buildService({
        purchaseInvoice: {
          groupBy: jest.fn(),
          aggregate: jest.fn(),
          count: jest.fn(),
          findMany: jest.fn().mockResolvedValue([invoiceRow({ dueDate: null })]),
        },
      });
      const result = await service.getAging(actor, { asOfDate: '2026-02-01' } as any);
      expect(result.items[0].agingBasis).toBe('INVOICE_DATE_FALLBACK');
      expect(result.items[0].daysOverdue).toBe(31);
      expect(result.items[0].bucket).toBe('DAYS_31_60');
    });

    it.each([
      ['2026-01-01', 'CURRENT'],
      ['2025-12-15', 'DAYS_1_30'],
      ['2025-11-15', 'DAYS_31_60'],
      ['2025-10-15', 'DAYS_61_90'],
      ['2025-08-01', 'DAYS_90_PLUS'],
    ])('buckets dueDate=%s relative to asOfDate 2026-01-01 as %s', async (dueDate, expectedBucket) => {
      const { service } = buildService({
        purchaseInvoice: {
          groupBy: jest.fn(),
          aggregate: jest.fn(),
          count: jest.fn(),
          findMany: jest.fn().mockResolvedValue([
            invoiceRow({ dueDate: new Date(`${dueDate}T00:00:00.000Z`) }),
          ]),
        },
      });
      const result = await service.getAging(actor, { asOfDate: '2026-01-01' } as any);
      expect(result.items[0].bucket).toBe(expectedBucket);
    });

    it('defaults asOfDate to today when omitted', async () => {
      const { service } = buildService();
      const result = await service.getAging(actor, {} as any);
      expect(result.asOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('getStatement', () => {
    it('throws NotFoundException when the supplier does not exist', async () => {
      const { service } = buildService();
      await expect(
        service.getStatement(actor, supplierId, {} as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when fromDate is after toDate', async () => {
      const { service } = buildService({
        supplier: { findFirst: jest.fn().mockResolvedValue({ id: supplierId, name: 'Acme' }), findMany: jest.fn() },
      });
      await expect(
        service.getStatement(actor, supplierId, {
          fromDate: '2026-02-01',
          toDate: '2026-01-01',
          page: 1,
          limit: 50,
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('produces two lines (PAYMENT + PAYMENT_REVERSAL) for a reversed payment and computes running balance', async () => {
      const queryRaw = jest
        .fn()
        .mockResolvedValueOnce([{ signed: '500.0000', cnt: 3 }])
        .mockResolvedValueOnce([
          { id: 'inv-1', date: new Date('2026-01-01T00:00:00.000Z'), type: 'INVOICE', reference: 'PINV-1', description: null, amount: '500.0000', cumulative: '500.0000' },
          { id: 'pay-1', date: new Date('2026-01-05T00:00:00.000Z'), type: 'PAYMENT', reference: '', description: null, amount: '-500.0000', cumulative: '0.0000' },
          { id: 'pay-1', date: new Date('2026-01-10T00:00:00.000Z'), type: 'PAYMENT_REVERSAL', reference: '', description: 'oops', amount: '500.0000', cumulative: '500.0000' },
        ]);
      const { service } = buildService({
        supplier: { findFirst: jest.fn().mockResolvedValue({ id: supplierId, name: 'Acme' }), findMany: jest.fn() },
        queryRaw,
      });

      const result = await service.getStatement(actor, supplierId, { page: 1, limit: 50 } as any);
      expect(result.items).toHaveLength(3);
      expect(result.items[1].type).toBe('PAYMENT');
      expect(result.items[2].type).toBe('PAYMENT_REVERSAL');
      expect(result.items[2].runningBalance).toBe('500.0000');
      expect(result.closingBalance).toBe('500.0000');
      expect(result.total).toBe(3);
    });

    it('keeps total/closingBalance correct even when the requested page is beyond the last page', async () => {
      const queryRaw = jest
        .fn()
        .mockResolvedValueOnce([{ signed: '500.0000', cnt: 1 }])
        .mockResolvedValueOnce([]);
      const { service } = buildService({
        supplier: { findFirst: jest.fn().mockResolvedValue({ id: supplierId, name: 'Acme' }), findMany: jest.fn() },
        queryRaw,
      });

      const result = await service.getStatement(actor, supplierId, { page: 99, limit: 50 } as any);
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(1);
      expect(result.closingBalance).toBe('500.0000');
    });
  });

  describe('getReconciliation', () => {
    it('returns null GL fields when no ACCOUNTS_PAYABLE mapping is configured', async () => {
      const { service } = buildService({
        purchaseInvoice: {
          groupBy: jest.fn(),
          aggregate: jest.fn().mockResolvedValue({ _sum: { total: decimal('300.0000'), amountPaid: decimal('100.0000') } }),
          count: jest.fn(),
          findMany: jest.fn(),
        },
      });
      const result = await service.getReconciliation(actor);
      expect(result).toEqual({
        subledgerTotalOutstanding: '200.0000',
        glAccountId: null,
        glAccountsPayableBalance: null,
        difference: null,
        matches: false,
      });
    });

    it('reports matches=true when the subledger and GL balance agree', async () => {
      const { service } = buildService({
        purchaseInvoice: {
          groupBy: jest.fn(),
          aggregate: jest.fn().mockResolvedValue({ _sum: { total: decimal('300.0000'), amountPaid: decimal('100.0000') } }),
          count: jest.fn(),
          findMany: jest.fn(),
        },
        ledgerClient: {
          findAccountsPayableMapping: jest
            .fn()
            .mockResolvedValue({ accountId: 'acc-1', accountCode: '2000', accountName: 'Accounts Payable' }),
          getAccountBalance: jest.fn().mockResolvedValue('200.0000'),
        },
      });
      const result = await service.getReconciliation(actor);
      expect(result).toEqual({
        subledgerTotalOutstanding: '200.0000',
        glAccountId: 'acc-1',
        glAccountsPayableBalance: '200.0000',
        difference: '0.0000',
        matches: true,
      });
    });

    it('reports matches=false with the correct difference on a mismatch', async () => {
      const { service } = buildService({
        purchaseInvoice: {
          groupBy: jest.fn(),
          aggregate: jest.fn().mockResolvedValue({ _sum: { total: decimal('300.0000'), amountPaid: decimal('100.0000') } }),
          count: jest.fn(),
          findMany: jest.fn(),
        },
        ledgerClient: {
          findAccountsPayableMapping: jest
            .fn()
            .mockResolvedValue({ accountId: 'acc-1', accountCode: '2000', accountName: 'Accounts Payable' }),
          getAccountBalance: jest.fn().mockResolvedValue('150.0000'),
        },
      });
      const result = await service.getReconciliation(actor);
      expect(result.matches).toBe(false);
      expect(result.difference).toBe('50.0000');
    });
  });
});
