import { BadRequestException } from '@nestjs/common';
import { AccountType, Prisma } from '../../generated/prisma-client';
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  const actor = {
    userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    tenantId: '11111111-1111-4111-8111-111111111111',
  };

  function decimal(v: string) {
    return new Prisma.Decimal(v);
  }

  function account(id: string, code: string, type: AccountType) {
    return { id, code, name: `Account ${code}`, type };
  }

  function groupRow(accountId: string, debit: string, credit: string) {
    return {
      accountId,
      _sum: { debitAmount: decimal(debit), creditAmount: decimal(credit) },
    };
  }

  /**
   * accountsByTypeKey maps a JSON-stringified sorted type filter (or 'ALL'
   * for an unfiltered call) to the fixture rows findMany should return for
   * that call — lets one mock correctly serve both the report's own
   * account list and profitAndLossLines()'s separate REVENUE/EXPENSE
   * lookup (used by getBalanceSheet()) without relying on call order.
   */
  function buildService(opts: {
    accountsByTypeKey: Record<string, ReturnType<typeof account>[]>;
    groupByQueue: ReturnType<typeof groupRow>[][];
  }) {
    const findMany = jest.fn().mockImplementation(async (args: { where?: { type?: { in: AccountType[] } } }) => {
      const types = args?.where?.type?.in;
      const key = types ? JSON.stringify([...types].sort()) : 'ALL';
      return opts.accountsByTypeKey[key] ?? [];
    });
    const groupByQueue = [...opts.groupByQueue];
    const groupBy = jest.fn().mockImplementation(async () => groupByQueue.shift() ?? []);
    const prisma = { account: { findMany }, journalLine: { groupBy } };
    const service = new ReportsService(prisma as never);
    return { service, prisma, findMany, groupBy };
  }

  describe('getTrialBalance()', () => {
    it('splits each account\'s raw debit-minus-credit into the Debit or Credit column by sign, totals balance, and lists zero-activity accounts as 0/0', async () => {
      const assetAcc = account('a1', '1001', AccountType.ASSET);
      const liabilityAcc = account('a2', '2001', AccountType.LIABILITY);
      const idleAcc = account('a3', '3001', AccountType.EQUITY);
      const { service, findMany, groupBy } = buildService({
        accountsByTypeKey: { ALL: [assetAcc, liabilityAcc, idleAcc] },
        groupByQueue: [
          [groupRow('a1', '1000', '200'), groupRow('a2', '0', '800')],
        ],
      });

      const result = await service.getTrialBalance(actor, { asOfDate: '2026-01-31' });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: actor.tenantId } }),
      );
      expect(groupBy).toHaveBeenCalledTimes(1);
      expect(result.items).toEqual([
        { account: expect.objectContaining({ id: 'a1' }), debit: '800.0000', credit: '0.0000' },
        { account: expect.objectContaining({ id: 'a2' }), debit: '0.0000', credit: '800.0000' },
        { account: expect.objectContaining({ id: 'a3' }), debit: '0.0000', credit: '0.0000' },
      ]);
      expect(result.totalDebit).toBe('800.0000');
      expect(result.totalCredit).toBe('800.0000');
      expect(result.balanced).toBe(true);
      expect(result.asOfDate).toBe('2026-01-31');
    });

    it('defaults asOfDate to today (UTC) when omitted', async () => {
      const { service } = buildService({ accountsByTypeKey: { ALL: [] }, groupByQueue: [[]] });
      const result = await service.getTrialBalance(actor, {});
      expect(result.asOfDate).toBe(new Date().toISOString().slice(0, 10));
    });

    it('surfaces an unbalanced total rather than hiding it (the diagnostic purpose of the report)', async () => {
      const assetAcc = account('a1', '1001', AccountType.ASSET);
      const { service } = buildService({
        accountsByTypeKey: { ALL: [assetAcc] },
        // A single unmatched debit with no offsetting credit anywhere —
        // deliberately inconsistent fixture data to prove the report
        // reports reality rather than asserting/forcing balance.
        groupByQueue: [[groupRow('a1', '500', '0')]],
      });

      const result = await service.getTrialBalance(actor, { asOfDate: '2026-01-31' });

      expect(result.totalDebit).toBe('500.0000');
      expect(result.totalCredit).toBe('0.0000');
      expect(result.balanced).toBe(false);
    });
  });

  describe('getProfitLoss()', () => {
    it('signs Revenue as credit-minus-debit and Expense as debit-minus-credit, and computes netIncome = revenue - expense', async () => {
      const revenueAcc = account('r1', '4001', AccountType.REVENUE);
      const expenseAcc = account('e1', '5001', AccountType.EXPENSE);
      const { service, groupBy } = buildService({
        accountsByTypeKey: {
          [JSON.stringify([AccountType.EXPENSE, AccountType.REVENUE].sort())]: [
            revenueAcc,
            expenseAcc,
          ],
        },
        groupByQueue: [[groupRow('r1', '0', '500'), groupRow('e1', '200', '0')]],
      });

      const result = await service.getProfitLoss(actor, {
        fromDate: '2026-01-01',
        toDate: '2026-01-31',
      });

      expect(groupBy).toHaveBeenCalledTimes(1);
      expect(result.revenue.items).toEqual([
        { account: expect.objectContaining({ id: 'r1' }), amount: '500.0000' },
      ]);
      expect(result.expenses.items).toEqual([
        { account: expect.objectContaining({ id: 'e1' }), amount: '200.0000' },
      ]);
      expect(result.revenue.total).toBe('500.0000');
      expect(result.expenses.total).toBe('200.0000');
      expect(result.netIncome).toBe('300.0000');
      expect(result.fromDate).toBe('2026-01-01');
      expect(result.toDate).toBe('2026-01-31');
    });

    it('rejects fromDate after toDate without querying account/line data', async () => {
      const { service, findMany, groupBy } = buildService({
        accountsByTypeKey: {},
        groupByQueue: [],
      });

      await expect(
        service.getProfitLoss(actor, { fromDate: '2026-02-01', toDate: '2026-01-01' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(findMany).not.toHaveBeenCalled();
      expect(groupBy).not.toHaveBeenCalled();
    });
  });

  describe('getBalanceSheet()', () => {
    it('folds cumulative Net Income into Equity as Retained Earnings so Assets = Liabilities + Equity holds', async () => {
      const assetAcc = account('a1', '1001', AccountType.ASSET);
      const liabilityAcc = account('l1', '2001', AccountType.LIABILITY);
      const equityAcc = account('q1', '3001', AccountType.EQUITY);
      const revenueAcc = account('r1', '4001', AccountType.REVENUE);
      const expenseAcc = account('e1', '5001', AccountType.EXPENSE);
      const { service, groupBy } = buildService({
        accountsByTypeKey: {
          [JSON.stringify(
            [AccountType.ASSET, AccountType.EQUITY, AccountType.LIABILITY].sort(),
          )]: [assetAcc, liabilityAcc, equityAcc],
          [JSON.stringify([AccountType.EXPENSE, AccountType.REVENUE].sort())]: [
            revenueAcc,
            expenseAcc,
          ],
        },
        groupByQueue: [
          // Balance-sheet-type window: Asset 1000 debit, Liability 400 credit, Equity 100 credit.
          [groupRow('a1', '1000', '0'), groupRow('l1', '0', '400'), groupRow('q1', '0', '100')],
          // Cumulative P&L window: Revenue 600 credit, Expense 100 debit -> netIncome 500.
          [groupRow('r1', '0', '600'), groupRow('e1', '100', '0')],
        ],
      });

      const result = await service.getBalanceSheet(actor, { asOfDate: '2026-01-31' });

      expect(groupBy).toHaveBeenCalledTimes(2);
      expect(result.assets.total).toBe('1000.0000');
      expect(result.liabilities.total).toBe('400.0000');
      expect(result.equity.retainedEarnings).toBe('500.0000');
      // 100 (equity accounts) + 500 (retained earnings) = 600
      expect(result.equity.total).toBe('600.0000');
      expect(result.totalLiabilitiesAndEquity).toBe('1000.0000');
      expect(result.balanced).toBe(true);
    });

    it('defaults asOfDate to today (UTC) when omitted', async () => {
      const { service } = buildService({
        accountsByTypeKey: {},
        groupByQueue: [[], []],
      });
      const result = await service.getBalanceSheet(actor, {});
      expect(result.asOfDate).toBe(new Date().toISOString().slice(0, 10));
    });

    it('is tenant-scoped: every account lookup and every line aggregate is filtered by the actor\'s own tenantId', async () => {
      const { service, findMany, groupBy } = buildService({
        accountsByTypeKey: {},
        groupByQueue: [[], []],
      });

      await service.getBalanceSheet(actor, { asOfDate: '2026-01-31' });

      for (const call of findMany.mock.calls) {
        expect((call[0] as { where: { tenantId: string } }).where.tenantId).toBe(
          actor.tenantId,
        );
      }
      for (const call of groupBy.mock.calls) {
        const where = (call[0] as { where: { tenantId: string; journalEntry: { tenantId: string } } })
          .where;
        expect(where.tenantId).toBe(actor.tenantId);
        expect(where.journalEntry.tenantId).toBe(actor.tenantId);
      }
    });
  });
});
