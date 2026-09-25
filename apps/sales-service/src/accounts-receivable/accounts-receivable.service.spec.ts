import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma-client';
import { AccountingLedgerClient } from '../accounting/accounting-ledger.client';
import { AccountsReceivableService } from './accounts-receivable.service';

describe('AccountsReceivableService', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const customerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  function decimal(v: string) {
    return new Prisma.Decimal(v);
  }

  function buildService(overrides: {
    salesInvoice?: Record<string, jest.Mock>;
    customer?: Record<string, jest.Mock>;
    salesPayment?: Record<string, jest.Mock>;
    queryRaw?: jest.Mock;
    ledgerClient?: Partial<AccountingLedgerClient>;
  } = {}) {
    const prisma = {
      salesInvoice: {
        groupBy: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { total: null, amountPaid: null } }),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        ...overrides.salesInvoice,
      },
      customer: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        ...overrides.customer,
      },
      salesPayment: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
        ...overrides.salesPayment,
      },
      $queryRaw: overrides.queryRaw ?? jest.fn().mockResolvedValue([]),
    };
    const ledgerClient = {
      findAccountsReceivableMapping: jest.fn().mockResolvedValue(null),
      getAccountBalance: jest.fn().mockResolvedValue('0.0000'),
      ...overrides.ledgerClient,
    } as unknown as AccountingLedgerClient;

    const service = new AccountsReceivableService(prisma as any, ledgerClient);
    return { service, prisma, ledgerClient };
  }

  describe('listCustomerSummaries', () => {
    it('returns an empty list when there are no SENT invoices', async () => {
      const { service } = buildService();
      const result = await service.listCustomerSummaries(actor, true);
      expect(result).toEqual({ items: [] });
    });

    it('excludes fully-paid customers when onlyOutstanding is true', async () => {
      const { service } = buildService({
        salesInvoice: {
          groupBy: jest.fn().mockImplementation((args: { where: Record<string, unknown> }) => {
            if ('paymentStatus' in (args.where ?? {})) {
              return Promise.resolve([{ customerId, _count: { _all: 0 } }]);
            }
            return Promise.resolve([
              { customerId, _sum: { total: decimal('100.0000'), amountPaid: decimal('100.0000') } },
            ]);
          }),
          aggregate: jest.fn(),
          count: jest.fn(),
          findMany: jest.fn(),
        },
        customer: {
          findFirst: jest.fn(),
          findMany: jest.fn().mockResolvedValue([{ id: customerId, code: 'CUST-1', name: 'Acme' }]),
        },
      });
      const result = await service.listCustomerSummaries(actor, true);
      expect(result.items).toEqual([]);
    });

    it('includes fully-paid customers when onlyOutstanding is false', async () => {
      const { service } = buildService({
        salesInvoice: {
          groupBy: jest.fn().mockImplementation((args: { where: Record<string, unknown> }) => {
            if ('paymentStatus' in (args.where ?? {})) {
              return Promise.resolve([]);
            }
            return Promise.resolve([
              { customerId, _sum: { total: decimal('100.0000'), amountPaid: decimal('100.0000') } },
            ]);
          }),
          aggregate: jest.fn(),
          count: jest.fn(),
          findMany: jest.fn(),
        },
        customer: {
          findFirst: jest.fn(),
          findMany: jest.fn().mockResolvedValue([{ id: customerId, code: 'CUST-1', name: 'Acme' }]),
        },
      });
      const result = await service.listCustomerSummaries(actor, false);
      expect(result.items).toEqual([
        expect.objectContaining({
          customerId,
          customerCode: 'CUST-1',
          customerName: 'Acme',
          totalInvoiced: '100.0000',
          totalPaid: '100.0000',
          totalOutstanding: '0.0000',
        }),
      ]);
    });
  });

  describe('getCustomerSummary', () => {
    it('throws NotFoundException when the customer does not exist in this tenant', async () => {
      const { service } = buildService();
      await expect(service.getCustomerSummary(actor, customerId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns totals for an existing customer', async () => {
      const { service } = buildService({
        customer: {
          findFirst: jest.fn().mockResolvedValue({ id: customerId, code: 'CUST-1', name: 'Acme' }),
          findMany: jest.fn(),
        },
        salesInvoice: {
          groupBy: jest.fn(),
          aggregate: jest
            .fn()
            .mockResolvedValue({ _sum: { total: decimal('500.0000'), amountPaid: decimal('200.0000') } }),
          count: jest.fn().mockResolvedValue(2),
          findMany: jest.fn(),
        },
      });
      const result = await service.getCustomerSummary(actor, customerId);
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
    it('defaults to status SENT and omits payments when includePayments is not set', async () => {
      const findMany = jest.fn().mockResolvedValue([
        {
          id: 'inv-1',
          invoiceNumber: 'SINV-1',
          customerId,
          customerName: 'Acme',
          invoiceDate: new Date('2026-01-01T00:00:00.000Z'),
          dueDate: null,
          total: decimal('100.0000'),
          amountPaid: decimal('0.0000'),
          paymentStatus: 'UNPAID',
          status: 'SENT',
          payments: [{ id: 'pay-1', amount: decimal('10.0000'), paymentDate: new Date() }],
        },
      ]);
      const { service } = buildService({
        salesInvoice: { groupBy: jest.fn(), aggregate: jest.fn(), count: jest.fn(), findMany },
      });

      const result = await service.listInvoices(actor, {});
      expect(findMany.mock.calls[0][0].where.status).toBe('SENT');
      expect(result.items[0].payments).toBeUndefined();
    });

    it('includes payments when includePayments=true', async () => {
      const findMany = jest.fn().mockResolvedValue([
        {
          id: 'inv-1',
          invoiceNumber: 'SINV-1',
          customerId,
          customerName: 'Acme',
          invoiceDate: new Date('2026-01-01T00:00:00.000Z'),
          dueDate: null,
          total: decimal('100.0000'),
          amountPaid: decimal('10.0000'),
          paymentStatus: 'PARTIALLY_PAID',
          status: 'SENT',
          payments: [
            { id: 'pay-1', amount: decimal('10.0000'), paymentDate: new Date('2026-01-05T00:00:00.000Z') },
          ],
        },
      ]);
      const { service } = buildService({
        salesInvoice: { groupBy: jest.fn(), aggregate: jest.fn(), count: jest.fn(), findMany },
      });

      const result = await service.listInvoices(actor, { includePayments: 'true' } as any);
      expect(result.items[0].payments).toEqual([
        { id: 'pay-1', amount: '10.0000', paymentDate: '2026-01-05' },
      ]);
      expect(result.items[0].balanceDue).toBe('90.0000');
    });

    it('applies customerId and paymentStatus filters', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const { service } = buildService({
        salesInvoice: { groupBy: jest.fn(), aggregate: jest.fn(), count: jest.fn(), findMany },
      });
      await service.listInvoices(actor, { customerId, paymentStatus: 'PAID' } as any);
      expect(findMany.mock.calls[0][0].where.customerId).toBe(customerId);
      expect(findMany.mock.calls[0][0].where.paymentStatus).toBe('PAID');
    });
  });

  describe('getAging', () => {
    function invoiceRow(overrides: Record<string, unknown>) {
      return {
        id: 'inv-1',
        invoiceNumber: 'SINV-1',
        customerId,
        customerName: 'Acme',
        invoiceDate: new Date('2026-01-01T00:00:00.000Z'),
        dueDate: null,
        total: decimal('100.0000'),
        amountPaid: decimal('0.0000'),
        ...overrides,
      };
    }

    it('uses DUE_DATE basis and buckets CURRENT when not yet due', async () => {
      const { service } = buildService({
        salesInvoice: {
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
        salesInvoice: {
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
        salesInvoice: {
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
    it('throws NotFoundException when the customer does not exist', async () => {
      const { service } = buildService();
      await expect(
        service.getStatement(actor, customerId, {} as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when fromDate is after toDate', async () => {
      const { service } = buildService({
        customer: { findFirst: jest.fn().mockResolvedValue({ id: customerId, name: 'Acme' }), findMany: jest.fn() },
      });
      await expect(
        service.getStatement(actor, customerId, {
          fromDate: '2026-02-01',
          toDate: '2026-01-01',
          page: 1,
          limit: 50,
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('produces INVOICE and PAYMENT lines only (no PAYMENT_REVERSAL type exists on this side) and computes running balance', async () => {
      const queryRaw = jest
        .fn()
        .mockResolvedValueOnce([{ signed: '200.0000', cnt: 2 }])
        .mockResolvedValueOnce([
          { id: 'inv-1', date: new Date('2026-01-01T00:00:00.000Z'), type: 'INVOICE', reference: 'SINV-1', description: null, amount: '500.0000', cumulative: '500.0000' },
          { id: 'pay-1', date: new Date('2026-01-05T00:00:00.000Z'), type: 'PAYMENT', reference: '', description: null, amount: '-300.0000', cumulative: '200.0000' },
        ]);
      const { service } = buildService({
        customer: { findFirst: jest.fn().mockResolvedValue({ id: customerId, name: 'Acme' }), findMany: jest.fn() },
        queryRaw,
      });

      const result = await service.getStatement(actor, customerId, { page: 1, limit: 50 } as any);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].type).toBe('INVOICE');
      expect(result.items[1].type).toBe('PAYMENT');
      expect(result.items.some((item) => (item.type as string) === 'PAYMENT_REVERSAL')).toBe(false);
      expect(result.items[1].runningBalance).toBe('200.0000');
      expect(result.closingBalance).toBe('200.0000');
      expect(result.total).toBe(2);
    });

    it('keeps total/closingBalance correct even when the requested page is beyond the last page', async () => {
      const queryRaw = jest
        .fn()
        .mockResolvedValueOnce([{ signed: '500.0000', cnt: 1 }])
        .mockResolvedValueOnce([]);
      const { service } = buildService({
        customer: { findFirst: jest.fn().mockResolvedValue({ id: customerId, name: 'Acme' }), findMany: jest.fn() },
        queryRaw,
      });

      const result = await service.getStatement(actor, customerId, { page: 99, limit: 50 } as any);
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(1);
      expect(result.closingBalance).toBe('500.0000');
    });
  });

  describe('getReconciliation', () => {
    it('returns null GL fields when no ACCOUNTS_RECEIVABLE mapping is configured', async () => {
      const { service } = buildService({
        salesInvoice: {
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
        glAccountsReceivableBalance: null,
        difference: null,
        matches: false,
      });
    });

    it('reports matches=true when the subledger and GL balance agree', async () => {
      const { service } = buildService({
        salesInvoice: {
          groupBy: jest.fn(),
          aggregate: jest.fn().mockResolvedValue({ _sum: { total: decimal('300.0000'), amountPaid: decimal('100.0000') } }),
          count: jest.fn(),
          findMany: jest.fn(),
        },
        ledgerClient: {
          findAccountsReceivableMapping: jest
            .fn()
            .mockResolvedValue({ accountId: 'acc-1', accountCode: '1201', accountName: 'Accounts Receivable' }),
          getAccountBalance: jest.fn().mockResolvedValue('200.0000'),
        },
      });
      const result = await service.getReconciliation(actor);
      expect(result).toEqual({
        subledgerTotalOutstanding: '200.0000',
        glAccountId: 'acc-1',
        glAccountsReceivableBalance: '200.0000',
        difference: '0.0000',
        matches: true,
      });
    });

    it('reports matches=false with the correct difference on a mismatch', async () => {
      const { service } = buildService({
        salesInvoice: {
          groupBy: jest.fn(),
          aggregate: jest.fn().mockResolvedValue({ _sum: { total: decimal('300.0000'), amountPaid: decimal('100.0000') } }),
          count: jest.fn(),
          findMany: jest.fn(),
        },
        ledgerClient: {
          findAccountsReceivableMapping: jest
            .fn()
            .mockResolvedValue({ accountId: 'acc-1', accountCode: '1201', accountName: 'Accounts Receivable' }),
          getAccountBalance: jest.fn().mockResolvedValue('150.0000'),
        },
      });
      const result = await service.getReconciliation(actor);
      expect(result.matches).toBe(false);
      expect(result.difference).toBe('50.0000');
    });
  });
});
