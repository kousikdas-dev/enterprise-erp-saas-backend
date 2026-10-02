import { BadRequestException, Injectable } from '@nestjs/common';
import { AccountType, JournalEntryStatus, Prisma } from '../../generated/prisma-client';
import { isDebitNormal } from '../accounts/ledger/normal-balance';
import { ActorContext } from '../auth/actor-context';
import { PrismaService } from '../prisma/prisma.service';
import {
  BalanceSheetQueryDto,
  ProfitLossQueryDto,
  TrialBalanceQueryDto,
} from './dto/reports.dto';
import {
  ReportAccountRow,
  toBalanceSheetResponse,
  toProfitLossResponse,
  toTrialBalanceResponse,
} from './report-response';

const ZERO = new Prisma.Decimal(0);

/** UTC midnight of the given YYYY-MM-DD date-only string — mirrors
 * AccountLedgerService's identical helper exactly (see its own comment for
 * the rationale: no tenant-timezone concept exists anywhere in this
 * codebase). Duplicated rather than imported/shared, matching this
 * codebase's established per-service convention for this exact helper. */
function utcMidnight(dateOnly: string): Date {
  return new Date(`${dateOnly}T00:00:00.000Z`);
}

/** The day AFTER `dateOnly`, at UTC midnight — an exclusive upper bound
 * that correctly includes the entirety of `dateOnly`'s calendar day. */
function utcMidnightExclusiveUpperBound(dateOnly: string): Date {
  const day = utcMidnight(dateOnly);
  day.setUTCDate(day.getUTCDate() + 1);
  return day;
}

function todayUtcDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

type AccountSums = Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * For every account in the tenant's chart of accounts (regardless of
   * type or activity — a Trial Balance's job is completeness auditing, so
   * a zero-balance account is still listed), the raw closing
   * debit-minus-credit difference of every POSTED line up to and including
   * asOfDate, split into a Debit or Credit column by sign. This is the
   * traditional trial-balance computation — it deliberately does NOT use
   * isDebitNormal: the whole point is to mechanically show whichever side
   * the raw balance actually landed on, not which side the account "should"
   * normally have (a genuinely abnormal balance is exactly what a Trial
   * Balance exists to surface, not to reclassify away).
   */
  async getTrialBalance(actor: ActorContext, query: TrialBalanceQueryDto) {
    const asOfDate = query.asOfDate ?? todayUtcDateOnly();
    const upperBound = utcMidnightExclusiveUpperBound(asOfDate);

    const accounts = await this.prisma.account.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true, type: true },
    });

    const sums = await this.sumByAccount(actor, {
      lt: upperBound,
    });

    const lines = accounts.map((account) => {
      const sum = sums.get(account.id) ?? { debit: ZERO, credit: ZERO };
      const raw = sum.debit.minus(sum.credit);
      return {
        account: account as ReportAccountRow,
        debit: raw.gte(0) ? raw : ZERO,
        credit: raw.lt(0) ? raw.neg() : ZERO,
      };
    });

    return toTrialBalanceResponse({ asOfDate, lines });
  }

  /**
   * Revenue and Expense accounts only, activity strictly within
   * [fromDate, toDate] (inclusive both ends — toDate's whole calendar day
   * counts). Each account's amount is signed via isDebitNormal so Revenue
   * shows positive when credited and Expense shows positive when debited —
   * unlike Trial Balance, a P&L legitimately needs "normal side" semantics,
   * not a raw mechanical split.
   */
  async getProfitLoss(actor: ActorContext, query: ProfitLossQueryDto) {
    const fromDate = utcMidnight(query.fromDate);
    const toDateExclusive = utcMidnightExclusiveUpperBound(query.toDate);
    if (fromDate >= toDateExclusive) {
      throw new BadRequestException('fromDate must not be after toDate');
    }

    const { revenueLines, expenseLines } = await this.profitAndLossLines(
      actor,
      { gte: fromDate, lt: toDateExclusive },
    );

    return toProfitLossResponse({
      fromDate: query.fromDate,
      toDate: query.toDate,
      revenueLines,
      expenseLines,
    });
  }

  /**
   * Asset/Liability/Equity accounts as of asOfDate, plus Net Income
   * accumulated since inception up to asOfDate folded into Equity as a
   * computed "Retained Earnings" line (see toBalanceSheetResponse()'s own
   * comment — this codebase has no period-closing concept, so without this
   * the balance sheet could never actually balance).
   */
  async getBalanceSheet(actor: ActorContext, query: BalanceSheetQueryDto) {
    const asOfDate = query.asOfDate ?? todayUtcDateOnly();
    const upperBound = utcMidnightExclusiveUpperBound(asOfDate);

    const accounts = await this.prisma.account.findMany({
      where: {
        tenantId: actor.tenantId,
        type: {
          in: [AccountType.ASSET, AccountType.LIABILITY, AccountType.EQUITY],
        },
      },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true, type: true },
    });

    const sums = await this.sumByAccount(actor, { lt: upperBound });

    const signedBalance = (accountId: string, type: AccountType) => {
      const sum = sums.get(accountId) ?? { debit: ZERO, credit: ZERO };
      return isDebitNormal(type)
        ? sum.debit.minus(sum.credit)
        : sum.credit.minus(sum.debit);
    };

    const assetLines = accounts
      .filter((a) => a.type === AccountType.ASSET)
      .map((account) => ({
        account: account as ReportAccountRow,
        amount: signedBalance(account.id, account.type),
      }));
    const liabilityLines = accounts
      .filter((a) => a.type === AccountType.LIABILITY)
      .map((account) => ({
        account: account as ReportAccountRow,
        amount: signedBalance(account.id, account.type),
      }));
    const equityLines = accounts
      .filter((a) => a.type === AccountType.EQUITY)
      .map((account) => ({
        account: account as ReportAccountRow,
        amount: signedBalance(account.id, account.type),
      }));

    // Net Income since inception (no lower bound) up to asOfDate — the
    // cumulative figure a real closing entry would have already moved into
    // Equity, had this codebase implemented period closing.
    const { revenueLines, expenseLines } = await this.profitAndLossLines(
      actor,
      { lt: upperBound },
    );
    const totalRevenue = revenueLines.reduce(
      (sum, line) => sum.plus(line.amount),
      ZERO,
    );
    const totalExpense = expenseLines.reduce(
      (sum, line) => sum.plus(line.amount),
      ZERO,
    );
    const netIncome = totalRevenue.minus(totalExpense);

    return toBalanceSheetResponse({
      asOfDate,
      assetLines,
      liabilityLines,
      equityLines,
      netIncome,
    });
  }

  /** Per-account signed sum of Revenue/Expense activity in the given
   * window, shared by getProfitLoss() and getBalanceSheet()'s own
   * cumulative-net-income calculation. */
  private async profitAndLossLines(
    actor: ActorContext,
    entryDateFilter: Prisma.DateTimeFilter,
  ) {
    const accounts = await this.prisma.account.findMany({
      where: {
        tenantId: actor.tenantId,
        type: { in: [AccountType.REVENUE, AccountType.EXPENSE] },
      },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true, type: true },
    });

    const sums = await this.sumByAccount(actor, entryDateFilter);

    const signed = (accountId: string, type: AccountType) => {
      const sum = sums.get(accountId) ?? { debit: ZERO, credit: ZERO };
      return isDebitNormal(type)
        ? sum.debit.minus(sum.credit)
        : sum.credit.minus(sum.debit);
    };

    const revenueLines = accounts
      .filter((a) => a.type === AccountType.REVENUE)
      .map((account) => ({
        account: account as ReportAccountRow,
        amount: signed(account.id, account.type),
      }));
    const expenseLines = accounts
      .filter((a) => a.type === AccountType.EXPENSE)
      .map((account) => ({
        account: account as ReportAccountRow,
        amount: signed(account.id, account.type),
      }));

    return { revenueLines, expenseLines };
  }

  /** Groups every POSTED JournalLine in the given entryDate window by
   * accountId, summing debit/credit in Postgres NUMERIC (never JS floating
   * point) — the shared per-account aggregate every report above is built
   * from. */
  private async sumByAccount(
    actor: ActorContext,
    entryDateFilter: Prisma.DateTimeFilter,
  ): Promise<AccountSums> {
    const grouped = await this.prisma.journalLine.groupBy({
      by: ['accountId'],
      where: {
        tenantId: actor.tenantId,
        journalEntry: {
          tenantId: actor.tenantId,
          status: JournalEntryStatus.POSTED,
          entryDate: entryDateFilter,
        },
      },
      _sum: { debitAmount: true, creditAmount: true },
    });

    const map: AccountSums = new Map();
    for (const row of grouped) {
      map.set(row.accountId, {
        debit: row._sum.debitAmount ?? ZERO,
        credit: row._sum.creditAmount ?? ZERO,
      });
    }
    return map;
  }
}
