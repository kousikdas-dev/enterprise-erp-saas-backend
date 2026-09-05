import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { JournalEntryStatus, Prisma } from '../../generated/prisma-client';
import { JournalEntriesService } from './journal-entries.service';

describe('JournalEntriesService', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const otherTenantId = '22222222-2222-4222-8222-222222222222';
  const actor = {
    userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    tenantId,
  };

  const cashAccount = {
    id: 'acc-cash',
    code: '1000',
    name: 'Cash',
    isActive: true,
  };
  const revenueAccount = {
    id: 'acc-revenue',
    code: '4000',
    name: 'Revenue',
    isActive: true,
  };
  const inactiveAccount = {
    id: 'acc-inactive',
    code: '1100',
    name: 'Accounts Receivable - Customers',
    isActive: false,
  };

  function makeLine(
    overrides: Partial<{
      id: string;
      lineNumber: number;
      accountId: string;
      account: { id: string; code: string; name: string };
      debitAmount: Prisma.Decimal;
      creditAmount: Prisma.Decimal;
      description: string | null;
    }> = {},
  ) {
    return {
      id: overrides.id ?? 'line-1',
      tenantId,
      journalEntryId: 'je-1',
      lineNumber: overrides.lineNumber ?? 1,
      accountId: overrides.accountId ?? cashAccount.id,
      account: overrides.account ?? cashAccount,
      debitAmount: overrides.debitAmount ?? new Prisma.Decimal(0),
      creditAmount: overrides.creditAmount ?? new Prisma.Decimal(0),
      description: overrides.description ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  function makeEntry(
    overrides: Partial<{
      id: string;
      status: JournalEntryStatus;
      lines: ReturnType<typeof makeLine>[];
      postedAt: Date | null;
    }> = {},
  ) {
    return {
      id: overrides.id ?? 'je-1',
      tenantId,
      entryNumber: 'JE-00000001',
      entryDate: new Date('2026-01-01'),
      description: null,
      status: overrides.status ?? JournalEntryStatus.DRAFT,
      postedAt: overrides.postedAt ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lines: overrides.lines ?? [],
    };
  }

  function buildService(
    overrides: {
      journalEntry?: Partial<Record<string, jest.Mock>>;
      journalLine?: Partial<Record<string, jest.Mock>>;
      accounts?: { require: jest.Mock };
      queryRaw?: jest.Mock;
    } = {},
  ) {
    const prisma = {
      journalEntry: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        ...overrides.journalEntry,
      },
      journalLine: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
        ...overrides.journalLine,
      },
      // Simulates SELECT ... FOR UPDATE: by default, the locked row's status
      // matches whatever journalEntry.findFirst()'s first resolved value
      // would report for a DRAFT entry, matching the tests' `existing` fixture.
      $queryRaw:
        overrides.queryRaw ??
        jest.fn().mockResolvedValue([{ status: 'DRAFT' }]),
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (fn: (client: typeof prisma) => Promise<unknown>) => fn(prisma),
    );

    const accounts = overrides.accounts ?? {
      require: jest.fn().mockImplementation((_actor, id: string) => {
        if (id === cashAccount.id) return Promise.resolve(cashAccount);
        if (id === revenueAccount.id) return Promise.resolve(revenueAccount);
        if (id === inactiveAccount.id) return Promise.resolve(inactiveAccount);
        return Promise.reject(new NotFoundException('Account not found'));
      }),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };

    const service = new JournalEntriesService(
      prisma as never,
      accounts as never,
      audit as never,
    );

    return { service, prisma, accounts, audit };
  }

  const validLineDtos = () => [
    {
      lineNumber: 1,
      accountId: cashAccount.id,
      debitAmount: '100.00',
      creditAmount: '0',
    },
    {
      lineNumber: 2,
      accountId: revenueAccount.id,
      debitAmount: '0',
      creditAmount: '100.00',
    },
  ];

  describe('create', () => {
    it('creates a journal entry as DRAFT with a generated entry number (1, 3, 25)', async () => {
      const created = makeEntry({
        lines: [
          makeLine({
            id: 'l1',
            lineNumber: 1,
            debitAmount: new Prisma.Decimal(100),
          }),
          makeLine({
            id: 'l2',
            lineNumber: 2,
            accountId: revenueAccount.id,
            account: revenueAccount,
            creditAmount: new Prisma.Decimal(100),
          }),
        ],
      });
      const { service, prisma, audit } = buildService({
        journalEntry: { create: jest.fn().mockResolvedValue(created) },
      });

      const result = await service.create(actor, { lines: validLineDtos() });

      expect(result.status).toBe('DRAFT');
      expect(result.lines).toHaveLength(2);
      expect(prisma.journalEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: actor.tenantId,
            entryNumber: 'JE-00000001',
            status: JournalEntryStatus.DRAFT,
          }) as {
            tenantId: string;
            entryNumber: string;
            status: JournalEntryStatus;
          },
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'journal-entry.created' }),
      );
    });

    it('uses the actor tenant, never a client-supplied tenantId (2)', async () => {
      const created = makeEntry({ lines: [] });
      const { service, prisma } = buildService({
        journalEntry: { create: jest.fn().mockResolvedValue(created) },
      });

      const spoofed = { tenantId: otherTenantId, lines: [] } as never;
      await service.create(actor, spoofed);

      expect(prisma.journalEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: actor.tenantId }) as {
            tenantId: string;
          },
        }),
      );
    });

    it('rejects a nonexistent account (4)', async () => {
      const { service, prisma, accounts } = buildService();
      accounts.require.mockRejectedValue(
        new NotFoundException('Account not found'),
      );

      await expect(
        service.create(actor, {
          lines: [
            {
              lineNumber: 1,
              accountId: 'missing',
              debitAmount: '10',
              creditAmount: '0',
            },
          ],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.journalEntry.create).not.toHaveBeenCalled();
    });

    it('rejects an account belonging to another tenant, using the same safe message (5)', async () => {
      // AccountsService.require() already returns the identical NotFoundException
      // for "does not exist" and "exists but in another tenant" — reused as-is.
      const { service, accounts } = buildService();
      accounts.require.mockRejectedValue(
        new NotFoundException('Account not found'),
      );

      await expect(
        service.create(actor, {
          lines: [
            {
              lineNumber: 1,
              accountId: 'other-tenant-account',
              debitAmount: '10',
              creditAmount: '0',
            },
          ],
        }),
      ).rejects.toThrow('Account not found');
    });

    it('rejects a line with zero debit and zero credit (6)', async () => {
      const { service, accounts } = buildService();

      await expect(
        service.create(actor, {
          lines: [
            {
              lineNumber: 1,
              accountId: cashAccount.id,
              debitAmount: '0',
              creditAmount: '0',
            },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(accounts.require).not.toHaveBeenCalled();
    });

    it('rejects a line with both debit and credit non-zero (7)', async () => {
      const { service } = buildService();

      await expect(
        service.create(actor, {
          lines: [
            {
              lineNumber: 1,
              accountId: cashAccount.id,
              debitAmount: '10',
              creditAmount: '5',
            },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a negative debit (8)', async () => {
      const { service } = buildService();

      await expect(
        service.create(actor, {
          lines: [
            {
              lineNumber: 1,
              accountId: cashAccount.id,
              debitAmount: '-10',
              creditAmount: '0',
            },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a negative credit (9)', async () => {
      const { service } = buildService();

      await expect(
        service.create(actor, {
          lines: [
            {
              lineNumber: 1,
              accountId: cashAccount.id,
              debitAmount: '0',
              creditAmount: '-5',
            },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects duplicate line numbers within the same entry (10)', async () => {
      const { service } = buildService();

      await expect(
        service.create(actor, {
          lines: [
            {
              lineNumber: 1,
              accountId: cashAccount.id,
              debitAmount: '10',
              creditAmount: '0',
            },
            {
              lineNumber: 1,
              accountId: revenueAccount.id,
              debitAmount: '0',
              creditAmount: '10',
            },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('update', () => {
    it('updates a DRAFT entry via a header-only PATCH (11)', async () => {
      const existing = makeEntry({ status: JournalEntryStatus.DRAFT });
      const updated = { ...existing, description: 'Updated memo' };
      const findFirst = jest
        .fn()
        .mockResolvedValueOnce(existing) // require() at start of update()
        .mockResolvedValueOnce(updated); // re-fetch inside the transaction after the write
      const { service, prisma } = buildService({
        journalEntry: {
          findFirst,
          update: jest.fn().mockResolvedValue(updated),
        },
      });

      const result = await service.update(actor, existing.id, {
        description: 'Updated memo',
      });

      expect(result.description).toBe('Updated memo');
      // The row lock (SELECT ... FOR UPDATE) must always be acquired first...
      expect(prisma.$queryRaw).toHaveBeenCalled();
      // ...and only then does the header write happen.
      expect(prisma.journalEntry.update).toHaveBeenCalledWith({
        where: { id: existing.id },
        data: { description: 'Updated memo' },
      });
    });

    it('updates a DRAFT entry via a lines-only PATCH, with no header write attempted', async () => {
      // Regression: updateMany({ data: {} }) is a Prisma no-op (see the fix
      // comment in journal-entries.service.ts) — a lines-only PATCH must not
      // rely on it. This proves the lock is still acquired and lines are
      // still replaced even when headerData ends up empty.
      const existing = makeEntry({ status: JournalEntryStatus.DRAFT });
      const updated = { ...existing };
      const findFirst = jest
        .fn()
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(updated);
      const { service, prisma } = buildService({
        journalEntry: { findFirst },
      });

      await service.update(actor, existing.id, { lines: validLineDtos() });

      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(prisma.journalEntry.update).not.toHaveBeenCalled();
      expect(prisma.journalLine.deleteMany).toHaveBeenCalledWith({
        where: { journalEntryId: existing.id, tenantId: actor.tenantId },
      });
      expect(prisma.journalLine.createMany).toHaveBeenCalled();
    });

    it('cannot update a POSTED entry (12)', async () => {
      const existing = makeEntry({ status: JournalEntryStatus.POSTED });
      const { service, prisma } = buildService({
        journalEntry: { findFirst: jest.fn().mockResolvedValue(existing) },
      });

      await expect(
        service.update(actor, existing.id, { description: 'x' }),
      ).rejects.toBeInstanceOf(ConflictException);
      // The early status guard rejects before the transaction/lock is ever attempted.
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(prisma.journalEntry.update).not.toHaveBeenCalled();
    });

    it("cannot modify a POSTED entry's lines (13)", async () => {
      const existing = makeEntry({ status: JournalEntryStatus.POSTED });
      const { service, prisma } = buildService({
        journalEntry: { findFirst: jest.fn().mockResolvedValue(existing) },
      });

      await expect(
        service.update(actor, existing.id, { lines: validLineDtos() }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(prisma.journalLine.deleteMany).not.toHaveBeenCalled();
      expect(prisma.journalLine.createMany).not.toHaveBeenCalled();
    });

    it("tenant isolation prevents updating another tenant's entry (14)", async () => {
      const { service, prisma } = buildService({
        journalEntry: { findFirst: jest.fn().mockResolvedValue(null) },
      });

      await expect(
        service.update(actor, 'je-in-other-tenant', { description: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.journalEntry.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'je-in-other-tenant', tenantId: actor.tenantId },
        }),
      );
    });

    it('loses a race against a concurrent post() instead of mutating a POSTED entry (lines-only PATCH)', async () => {
      // The initial require() still observes DRAFT, but by the time this
      // transaction's SELECT ... FOR UPDATE acquires the row lock, a
      // concurrent post() has already committed and flipped the entry to
      // POSTED. This is deliberately a LINES-ONLY patch (no entryDate/
      // description), which is exactly the case the old updateMany({data:{}})
      // guard could never detect at all, since Prisma turns that call into a
      // no-op that never queries the database (see the fix comment in
      // journal-entries.service.ts). Mocking $queryRaw to return the
      // now-POSTED status is the unit-level equivalent of "the lock wait
      // resolved after the concurrent post() committed" — the real end-to-end
      // locking behavior (that a concurrent UPDATE genuinely blocks on this
      // row and this SELECT genuinely re-reads the post-commit status) was
      // verified empirically against a live Postgres instance; see the report
      // for that evidence, since this project's test suite is 100% mocked
      // Prisma unit tests with no live-database integration harness to
      // exercise real row-locking in an automated test.
      const existing = makeEntry({ status: JournalEntryStatus.DRAFT });
      const { service, prisma } = buildService({
        journalEntry: { findFirst: jest.fn().mockResolvedValue(existing) },
        queryRaw: jest.fn().mockResolvedValue([{ status: 'POSTED' }]),
      });

      await expect(
        service.update(actor, existing.id, { lines: validLineDtos() }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(prisma.journalEntry.update).not.toHaveBeenCalled();
      // The guard must fail before any line replacement is attempted, so the
      // POSTED entry's lines are never touched by the losing update().
      expect(prisma.journalLine.deleteMany).not.toHaveBeenCalled();
      expect(prisma.journalLine.createMany).not.toHaveBeenCalled();
    });
  });

  describe('post', () => {
    it('rejects posting with fewer than 2 lines (15)', async () => {
      const existing = makeEntry({ lines: [makeLine()] });
      const { service, prisma } = buildService({
        journalEntry: { findFirst: jest.fn().mockResolvedValue(existing) },
      });

      await expect(service.post(actor, existing.id)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.journalEntry.updateMany).not.toHaveBeenCalled();
    });

    it('rejects an unbalanced entry (16, 21)', async () => {
      const existing = makeEntry({
        lines: [
          makeLine({ id: 'l1', debitAmount: new Prisma.Decimal(100) }),
          makeLine({
            id: 'l2',
            accountId: revenueAccount.id,
            account: revenueAccount,
            creditAmount: new Prisma.Decimal(90),
          }),
        ],
      });
      const { service, prisma } = buildService({
        journalEntry: { findFirst: jest.fn().mockResolvedValue(existing) },
      });

      await expect(service.post(actor, existing.id)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      // Posting failure must never touch the row — the entry stays DRAFT.
      expect(prisma.journalEntry.updateMany).not.toHaveBeenCalled();
    });

    it('accepts and posts a balanced entry, setting status and postedAt (17, 18, 19)', async () => {
      const balancedLines = [
        makeLine({ id: 'l1', debitAmount: new Prisma.Decimal(100) }),
        makeLine({
          id: 'l2',
          accountId: revenueAccount.id,
          account: revenueAccount,
          creditAmount: new Prisma.Decimal(100),
        }),
      ];
      const existing = makeEntry({ lines: balancedLines });
      const posted = makeEntry({
        status: JournalEntryStatus.POSTED,
        lines: balancedLines,
        postedAt: new Date(),
      });
      const findFirst = jest
        .fn()
        .mockResolvedValueOnce(existing) // require() at start of post()
        .mockResolvedValueOnce(posted); // require() re-fetch after posting
      const { service, prisma, audit } = buildService({
        journalEntry: {
          findFirst,
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      });

      const result = await service.post(actor, existing.id);

      expect(prisma.journalEntry.updateMany).toHaveBeenCalledWith({
        where: {
          id: existing.id,
          tenantId: actor.tenantId,
          status: JournalEntryStatus.DRAFT,
        },
        data: {
          status: JournalEntryStatus.POSTED,
          postedAt: expect.any(Date) as Date,
        },
      });
      expect(result.status).toBe('POSTED');
      expect(result.postedAt).not.toBeNull();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'journal-entry.posted' }),
      );
    });

    it('rejects posting when a referenced account is inactive', async () => {
      const existing = makeEntry({
        lines: [
          makeLine({ id: 'l1', debitAmount: new Prisma.Decimal(100) }),
          makeLine({
            id: 'l2',
            accountId: inactiveAccount.id,
            account: inactiveAccount,
            creditAmount: new Prisma.Decimal(100),
          }),
        ],
      });
      const { service, prisma, audit } = buildService({
        journalEntry: { findFirst: jest.fn().mockResolvedValue(existing) },
      });

      await expect(service.post(actor, existing.id)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      // The entry must remain DRAFT — the atomic transition is never attempted.
      expect(prisma.journalEntry.updateMany).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'journal-entry.posted' }),
      );
    });

    it('cannot post an already-POSTED entry (20)', async () => {
      const existing = makeEntry({
        status: JournalEntryStatus.POSTED,
        lines: [makeLine(), makeLine({ id: 'l2' })],
      });
      const { service, prisma } = buildService({
        journalEntry: { findFirst: jest.fn().mockResolvedValue(existing) },
      });

      await expect(service.post(actor, existing.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.journalEntry.updateMany).not.toHaveBeenCalled();
    });

    it("tenant isolation prevents posting another tenant's entry (22)", async () => {
      const { service, prisma } = buildService({
        journalEntry: { findFirst: jest.fn().mockResolvedValue(null) },
      });

      await expect(
        service.post(actor, 'je-in-other-tenant'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.journalEntry.updateMany).not.toHaveBeenCalled();
    });

    it("is concurrency-safe: a lost race on the atomic transition is rejected without exposing another tenant's row", async () => {
      const balancedLines = [
        makeLine({ id: 'l1', debitAmount: new Prisma.Decimal(100) }),
        makeLine({
          id: 'l2',
          accountId: revenueAccount.id,
          account: revenueAccount,
          creditAmount: new Prisma.Decimal(100),
        }),
      ];
      const existing = makeEntry({ lines: balancedLines });
      // Another request posted it between our read and our write.
      const nowPosted = makeEntry({
        status: JournalEntryStatus.POSTED,
        lines: balancedLines,
      });
      const findFirst = jest
        .fn()
        .mockResolvedValueOnce(existing) // require() at start of post()
        .mockResolvedValueOnce(nowPosted); // re-require() after the lost race
      const { service, prisma, audit } = buildService({
        journalEntry: {
          findFirst,
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      });

      await expect(service.post(actor, existing.id)).rejects.toThrow(
        'Only DRAFT journal entries can be posted',
      );
      expect(prisma.journalEntry.updateMany).toHaveBeenCalledWith({
        where: {
          id: existing.id,
          tenantId: actor.tenantId,
          status: JournalEntryStatus.DRAFT,
        },
        data: {
          status: JournalEntryStatus.POSTED,
          postedAt: expect.any(Date) as Date,
        },
      });
      expect(audit.record).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'journal-entry.posted' }),
      );
    });
  });

  describe('decimal safety', () => {
    it('balances a monetary case where native floating point would be wrong (23, 24)', async () => {
      // 0.10 + 0.20 !== 0.30 under JS Number arithmetic, but is exactly equal
      // under Prisma.Decimal — proves the balance check is decimal-safe.
      expect(0.1 + 0.2 === 0.3).toBe(false);

      const lines = [
        makeLine({ id: 'l1', debitAmount: new Prisma.Decimal('0.10') }),
        makeLine({ id: 'l2', debitAmount: new Prisma.Decimal('0.20') }),
        makeLine({
          id: 'l3',
          accountId: revenueAccount.id,
          account: revenueAccount,
          creditAmount: new Prisma.Decimal('0.30'),
        }),
      ];
      const existing = makeEntry({ lines });
      const posted = makeEntry({
        status: JournalEntryStatus.POSTED,
        lines,
        postedAt: new Date(),
      });
      const findFirst = jest
        .fn()
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(posted);
      const { service, prisma } = buildService({
        journalEntry: {
          findFirst,
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      });

      const result = await service.post(actor, existing.id);

      expect(result.status).toBe('POSTED');
      expect(prisma.journalEntry.updateMany).toHaveBeenCalled();
    });
  });
});
