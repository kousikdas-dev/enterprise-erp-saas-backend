import { BadRequestException, Injectable } from '@nestjs/common';
import { JournalEntryStatus, Prisma } from '../../../generated/prisma-client';
import { ActorContext } from '../../auth/actor-context';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsService } from '../accounts.service';
import { AccountLedgerQueryDto } from './account-ledger.dto';
import {
  AccountLedgerRawRow,
  toAccountLedgerResponse,
} from './account-ledger-response';
import { isDebitNormal } from './normal-balance';

const ZERO = new Prisma.Decimal(0);

/**
 * UTC midnight of the given YYYY-MM-DD date-only string. No tenant-timezone
 * concept exists anywhere in this codebase, so UTC calendar-day boundaries
 * are the only consistent choice — and match how entryDate is already
 * anchored when JournalEntry.create()/journal-postings create it from a
 * date-only string (`new Date('2026-01-01')` parses as UTC midnight).
 */
function utcMidnight(dateOnly: string): Date {
  return new Date(`${dateOnly}T00:00:00.000Z`);
}

/** The day AFTER `dateOnly`, at UTC midnight — an exclusive upper bound that
 * correctly includes the entirety of `dateOnly`'s calendar day. */
function utcMidnightExclusiveUpperBound(dateOnly: string): Date {
  const day = utcMidnight(dateOnly);
  day.setUTCDate(day.getUTCDate() + 1);
  return day;
}

@Injectable()
export class AccountLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
  ) {}

  async getLedger(
    actor: ActorContext,
    accountId: string,
    query: AccountLedgerQueryDto,
  ) {
    // Reuses AccountsService.require() — tenant-scoped lookup, 404 if
    // missing/wrong-tenant. Deliberately does NOT check isActive: historical
    // ledger data must stay readable after an account is deactivated; only
    // *new postings* are blocked for inactive accounts (post()'s own rule,
    // untouched here).
    const account = await this.accounts.require(actor, accountId);

    const fromDate = query.fromDate ? utcMidnight(query.fromDate) : null;
    const toDateExclusive = query.toDate
      ? utcMidnightExclusiveUpperBound(query.toDate)
      : null;

    if (fromDate && toDateExclusive && fromDate >= toDateExclusive) {
      throw new BadRequestException('fromDate must not be after toDate');
    }

    const debitNormal = isDebitNormal(account.type);
    const page = query.page;
    const limit = query.limit;
    const offset = (page - 1) * limit;

    const entryDateFilter =
      fromDate || toDateExclusive
        ? {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDateExclusive ? { lt: toDateExclusive } : {}),
          }
        : undefined;

    // Opening balance: signed sum of every POSTED line for this account
    // strictly before fromDate. No FiscalPeriod/TrialBalance concept exists
    // in this schema (see schema.prisma's header comment) — this read-time
    // aggregate IS the opening balance, computed in Postgres NUMERIC, never
    // JS floating point. Skipped entirely (opening balance = 0) when
    // fromDate is omitted, since there is then no "before the window" to sum.
    const openingBalance = fromDate
      ? await this.signedSum(actor, accountId, debitNormal, { lt: fromDate })
      : ZERO;

    // Window aggregate: signed sum + row count for the whole [fromDate,
    // toDate] window, independent of pagination. This is what makes
    // closingBalance and total correct even when the requested page is
    // beyond the last page (LIMIT/OFFSET would otherwise return zero rows,
    // losing any per-row COUNT(*) OVER() the paginated query could offer).
    const windowAgg = await this.prisma.journalLine.aggregate({
      where: {
        tenantId: actor.tenantId,
        accountId,
        journalEntry: {
          tenantId: actor.tenantId,
          status: JournalEntryStatus.POSTED,
          entryDate: entryDateFilter,
        },
      },
      _sum: { debitAmount: true, creditAmount: true },
      _count: true,
    });
    const windowSigned = this.signed(
      debitNormal,
      windowAgg._sum.debitAmount ?? ZERO,
      windowAgg._sum.creditAmount ?? ZERO,
    );
    const closingBalance = openingBalance.plus(windowSigned);
    const total = windowAgg._count;

    const normalSide = debitNormal ? 'DEBIT' : 'CREDIT';
    const rows = await this.prisma.$queryRaw<AccountLedgerRawRow[]>(Prisma.sql`
      WITH filtered AS (
        SELECT
          jl.id,
          jl."journalEntryId",
          jl."lineNumber",
          jl."debitAmount",
          jl."creditAmount",
          jl.description AS line_description,
          je."entryNumber",
          je."entryDate",
          je.description AS entry_description,
          je."sourceService",
          je."sourceType",
          je."sourceId",
          je."reversesJournalEntryId"
        FROM journal_lines jl
        JOIN journal_entries je ON je.id = jl."journalEntryId"
        WHERE jl."tenantId" = ${actor.tenantId}::uuid
          AND jl."accountId" = ${accountId}::uuid
          AND je."tenantId" = ${actor.tenantId}::uuid
          AND je.status = 'POSTED'::"JournalEntryStatus"
          AND (${fromDate}::timestamptz IS NULL OR je."entryDate" >= ${fromDate}::timestamptz)
          AND (${toDateExclusive}::timestamptz IS NULL OR je."entryDate" < ${toDateExclusive}::timestamptz)
      )
      SELECT
        id,
        "journalEntryId",
        "entryNumber",
        "entryDate",
        line_description AS "lineDescription",
        entry_description AS "entryDescription",
        "debitAmount",
        "creditAmount",
        "sourceService",
        "sourceType",
        "sourceId",
        "reversesJournalEntryId",
        SUM(
          CASE WHEN ${normalSide}::text = 'DEBIT' THEN "debitAmount" - "creditAmount"
               ELSE "creditAmount" - "debitAmount" END
        ) OVER (
          ORDER BY "entryDate", "entryNumber", "lineNumber", id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS cumulative
      FROM filtered
      ORDER BY "entryDate", "entryNumber", "lineNumber", id
      LIMIT ${limit} OFFSET ${offset}
    `);

    return toAccountLedgerResponse({
      account,
      fromDate: query.fromDate ?? null,
      toDate: query.toDate ?? null,
      openingBalance,
      closingBalance,
      rows,
      total,
      page,
      limit,
    });
  }

  private async signedSum(
    actor: ActorContext,
    accountId: string,
    debitNormal: boolean,
    entryDate: Prisma.DateTimeFilter,
  ): Promise<Prisma.Decimal> {
    const agg = await this.prisma.journalLine.aggregate({
      where: {
        tenantId: actor.tenantId,
        accountId,
        journalEntry: {
          tenantId: actor.tenantId,
          status: JournalEntryStatus.POSTED,
          entryDate,
        },
      },
      _sum: { debitAmount: true, creditAmount: true },
    });
    return this.signed(
      debitNormal,
      agg._sum.debitAmount ?? ZERO,
      agg._sum.creditAmount ?? ZERO,
    );
  }

  private signed(
    debitNormal: boolean,
    debit: Prisma.Decimal,
    credit: Prisma.Decimal,
  ): Prisma.Decimal {
    return debitNormal ? debit.minus(credit) : credit.minus(debit);
  }
}
