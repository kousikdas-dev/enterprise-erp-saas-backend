import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma-client';
import { AccountLedgerService } from './account-ledger.service';

describe('AccountLedgerService', () => {
  const actor = {
    userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    tenantId: '11111111-1111-4111-8111-111111111111',
  };
  const accountId = 'acc-1';

  function buildService(opts: {
    account?: { id: string; type: string; isActive?: boolean } | null;
    aggregateResults?: Array<{
      _sum: { debitAmount: Prisma.Decimal | null; creditAmount: Prisma.Decimal | null };
      _count?: number;
    }>;
    rawRows?: unknown[];
  }) {
    const account =
      opts.account !== undefined
        ? opts.account
        : { id: accountId, type: 'ASSET', isActive: true };
    const require = jest.fn().mockImplementation(async () => {
      if (!account) {
        throw new NotFoundException('Account not found');
      }
      return account;
    });
    const accounts = { require };

    const aggregateQueue = [...(opts.aggregateResults ?? [])];
    const aggregate = jest.fn().mockImplementation(async () => {
      const next = aggregateQueue.shift();
      return next ?? { _sum: { debitAmount: null, creditAmount: null }, _count: 0 };
    });
    const $queryRaw = jest.fn().mockResolvedValue(opts.rawRows ?? []);

    const prisma = { journalLine: { aggregate }, $queryRaw };
    const service = new AccountLedgerService(prisma as never, accounts as never);
    return { service, prisma, accounts, aggregate, $queryRaw, require };
  }

  it('404s when the account does not exist in this tenant', async () => {
    const { service } = buildService({ account: null });
    await expect(
      service.getLedger(actor, accountId, { page: 1, limit: 50 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows an inactive account (historical ledger stays readable)', async () => {
    const { service } = buildService({
      account: { id: accountId, type: 'ASSET', isActive: false },
      aggregateResults: [{ _sum: { debitAmount: null, creditAmount: null }, _count: 0 }],
    });
    await expect(
      service.getLedger(actor, accountId, { page: 1, limit: 50 }),
    ).resolves.toBeDefined();
  });

  it('rejects fromDate after toDate without querying line data', async () => {
    const { service, aggregate, $queryRaw } = buildService({});
    await expect(
      service.getLedger(actor, accountId, {
        fromDate: '2026-02-01',
        toDate: '2026-01-01',
        page: 1,
        limit: 50,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(aggregate).not.toHaveBeenCalled();
    expect($queryRaw).not.toHaveBeenCalled();
  });

  it('opening balance is 0 and skips the opening aggregate when fromDate is omitted', async () => {
    const { service, aggregate } = buildService({
      aggregateResults: [
        { _sum: { debitAmount: new Prisma.Decimal(0), creditAmount: new Prisma.Decimal(0) }, _count: 0 },
      ],
    });
    const result = await service.getLedger(actor, accountId, { page: 1, limit: 50 });
    expect(result.openingBalance).toBe('0.0000');
    // Only the window aggregate should run (1 call), not a separate opening aggregate.
    expect(aggregate).toHaveBeenCalledTimes(1);
  });

  it('computes a debit-normal (ASSET) opening balance as debit - credit', async () => {
    const { service } = buildService({
      account: { id: accountId, type: 'ASSET' },
      aggregateResults: [
        // opening aggregate (entryDate < fromDate)
        { _sum: { debitAmount: new Prisma.Decimal('500'), creditAmount: new Prisma.Decimal('120') } },
        // window aggregate
        { _sum: { debitAmount: new Prisma.Decimal(0), creditAmount: new Prisma.Decimal(0) }, _count: 0 },
      ],
    });
    const result = await service.getLedger(actor, accountId, {
      fromDate: '2026-01-01',
      page: 1,
      limit: 50,
    });
    expect(result.openingBalance).toBe('380.0000');
  });

  it('computes a credit-normal (LIABILITY) opening balance as credit - debit', async () => {
    const { service } = buildService({
      account: { id: accountId, type: 'LIABILITY' },
      aggregateResults: [
        { _sum: { debitAmount: new Prisma.Decimal('50'), creditAmount: new Prisma.Decimal('300') } },
        { _sum: { debitAmount: new Prisma.Decimal(0), creditAmount: new Prisma.Decimal(0) }, _count: 0 },
      ],
    });
    const result = await service.getLedger(actor, accountId, {
      fromDate: '2026-01-01',
      page: 1,
      limit: 50,
    });
    expect(result.openingBalance).toBe('250.0000');
  });

  it('closing balance and total come from the window aggregate, independent of the paginated rows', async () => {
    // Requesting a page far beyond the data (page 99): $queryRaw legitimately
    // returns zero rows, but total/closingBalance must still be correct —
    // this is exactly the "page beyond last page" case the window aggregate
    // (not a per-row COUNT(*) OVER()) is designed to get right.
    const { service } = buildService({
      account: { id: accountId, type: 'ASSET' },
      aggregateResults: [
        { _sum: { debitAmount: new Prisma.Decimal('1000'), creditAmount: new Prisma.Decimal('400') }, _count: 7 },
      ],
      rawRows: [],
    });
    const result = await service.getLedger(actor, accountId, { page: 99, limit: 10 });
    expect(result.total).toBe(7);
    expect(result.closingBalance).toBe('600.0000');
    expect(result.items).toEqual([]);
  });

  it('running balance = opening balance + each row\'s cumulative sum from the DB', async () => {
    const { service } = buildService({
      account: { id: accountId, type: 'ASSET' },
      aggregateResults: [
        { _sum: { debitAmount: new Prisma.Decimal('100'), creditAmount: new Prisma.Decimal('0') } }, // opening = 100
        { _sum: { debitAmount: new Prisma.Decimal('250'), creditAmount: new Prisma.Decimal('50') }, _count: 2 },
      ],
      rawRows: [
        {
          id: 'line-1',
          journalEntryId: 'je-1',
          entryNumber: 'JE-00000001',
          entryDate: new Date('2026-01-05T00:00:00.000Z'),
          lineDescription: null,
          entryDescription: 'Opening',
          debitAmount: new Prisma.Decimal('200'),
          creditAmount: new Prisma.Decimal('0'),
          sourceService: null,
          sourceType: null,
          sourceId: null,
          reversesJournalEntryId: null,
          cumulative: new Prisma.Decimal('200'),
        },
        {
          id: 'line-2',
          journalEntryId: 'je-2',
          entryNumber: 'JE-00000002',
          entryDate: new Date('2026-01-10T00:00:00.000Z'),
          lineDescription: 'Refund',
          entryDescription: 'Adjustment',
          debitAmount: new Prisma.Decimal('0'),
          creditAmount: new Prisma.Decimal('50'),
          sourceService: 'purchase-service',
          sourceType: 'PURCHASE_INVOICE',
          sourceId: 'pi-1',
          reversesJournalEntryId: null,
          cumulative: new Prisma.Decimal('150'),
        },
      ],
    });
    const result = await service.getLedger(actor, accountId, {
      fromDate: '2026-01-01',
      page: 1,
      limit: 50,
    });
    expect(result.openingBalance).toBe('100.0000');
    expect(result.items[0].runningBalance).toBe('300.0000');
    expect(result.items[0].description).toBe('Opening');
    expect(result.items[1].runningBalance).toBe('250.0000');
    expect(result.items[1].description).toBe('Refund');
    expect(result.items[1].sourceService).toBe('purchase-service');
    expect(result.items[1].sourceType).toBe('PURCHASE_INVOICE');
    expect(result.items[1].sourceId).toBe('pi-1');
  });

  it('empty window: opening balance equals closing balance and items is empty', async () => {
    const { service } = buildService({
      account: { id: accountId, type: 'ASSET' },
      aggregateResults: [
        { _sum: { debitAmount: new Prisma.Decimal(0), creditAmount: new Prisma.Decimal(0) } },
        { _sum: { debitAmount: null, creditAmount: null }, _count: 0 },
      ],
      rawRows: [],
    });
    const result = await service.getLedger(actor, accountId, {
      fromDate: '2026-01-01',
      toDate: '2026-01-31',
      page: 1,
      limit: 50,
    });
    expect(result.openingBalance).toBe(result.closingBalance);
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('passes UTC-midnight date bounds (inclusive fromDate, exclusive day-after toDate) to the raw query', async () => {
    const { service, $queryRaw } = buildService({
      account: { id: accountId, type: 'ASSET' },
      aggregateResults: [
        { _sum: { debitAmount: new Prisma.Decimal(0), creditAmount: new Prisma.Decimal(0) } },
        { _sum: { debitAmount: null, creditAmount: null }, _count: 0 },
      ],
    });
    await service.getLedger(actor, accountId, {
      fromDate: '2026-01-01',
      toDate: '2026-01-31',
      page: 1,
      limit: 50,
    });
    const sqlCall = $queryRaw.mock.calls[0][0] as { values: unknown[] };
    const dateValues = sqlCall.values.filter((v): v is Date => v instanceof Date);
    expect(dateValues).toContainEqual(new Date('2026-01-01T00:00:00.000Z'));
    // Exclusive upper bound is the day AFTER toDate.
    expect(dateValues).toContainEqual(new Date('2026-02-01T00:00:00.000Z'));
  });
});
