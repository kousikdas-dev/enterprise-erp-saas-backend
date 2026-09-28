import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma-client';
import { AccountingLedgerClient } from '../accounting/accounting-ledger.client';
import { ActorContext } from '../auth/actor-context';
import { moneyToString } from '../common/decimal';
import { PrismaService } from '../prisma/prisma.service';
import {
  ArAgingBasis,
  ArAgingBucket,
  AR_AGING_BUCKETS,
  CustomerArStatementRawRow,
  toArAgingRow,
  toArReconciliationSummary,
  toCustomerArLedgerItem,
  toCustomerArStatement,
  toCustomerArSummary,
} from './dto/accounts-receivable-response';
import {
  ArAgingQueryDto,
  ArInvoiceListQueryDto,
  ArStatementQueryDto,
} from './dto/accounts-receivable.dto';

const ZERO = new Prisma.Decimal(0);

/** UTC midnight of a YYYY-MM-DD date-only string — same convention as
 * accounting-service's AccountLedgerService and purchase-service's
 * AccountsPayableService (no tenant-timezone concept exists anywhere in
 * this codebase). Duplicated rather than imported: these are separate
 * microservices/deployments with no shared runtime code. */
function utcMidnight(dateOnly: string): Date {
  return new Date(`${dateOnly}T00:00:00.000Z`);
}

function utcMidnightExclusiveUpperBound(dateOnly: string): Date {
  const day = utcMidnight(dateOnly);
  day.setUTCDate(day.getUTCDate() + 1);
  return day;
}

function bucketFor(daysOverdue: number): ArAgingBucket {
  if (daysOverdue <= 0) return 'CURRENT';
  if (daysOverdue <= 30) return 'DAYS_1_30';
  if (daysOverdue <= 60) return 'DAYS_31_60';
  if (daysOverdue <= 90) return 'DAYS_61_90';
  return 'DAYS_90_PLUS';
}

@Injectable()
export class AccountsReceivableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerClient: AccountingLedgerClient,
  ) {}

  async listCustomerSummaries(actor: ActorContext, onlyOutstanding: boolean) {
    const grouped = await this.prisma.salesInvoice.groupBy({
      by: ['customerId'],
      where: { tenantId: actor.tenantId, status: 'SENT' },
      _sum: { total: true, amountPaid: true, amountCredited: true },
    });
    if (grouped.length === 0) {
      return { items: [] };
    }

    const outstandingCounts = await this.prisma.salesInvoice.groupBy({
      by: ['customerId'],
      where: {
        tenantId: actor.tenantId,
        status: 'SENT',
        paymentStatus: { not: 'PAID' },
      },
      _count: { _all: true },
    });
    const outstandingCountByCustomer = new Map(
      outstandingCounts.map((row) => [row.customerId, row._count._all]),
    );

    // Phase 3.14 — only currently-POSTED (not REVERSED) standalone Credit
    // Notes reduce AR; a REVERSED one is excluded entirely rather than
    // netted. Deliberately separate from totalCredited above (SalesReturn's
    // own amountCredited sum) — a Credit Note is not a SalesReturn.
    const creditNoteGroups = await this.prisma.salesCreditNote.groupBy({
      by: ['customerId'],
      where: { tenantId: actor.tenantId, status: 'POSTED' },
      _sum: { total: true },
    });
    const creditNotesByCustomer = new Map(
      creditNoteGroups.map((row) => [row.customerId, row._sum.total ?? ZERO]),
    );

    const customerIds = grouped.map((row) => row.customerId);
    const customers = await this.prisma.customer.findMany({
      where: { tenantId: actor.tenantId, id: { in: customerIds } },
      select: { id: true, code: true, name: true },
    });
    const customerById = new Map(customers.map((row) => [row.id, row]));

    const rows = grouped.map((row) => {
      const customer = customerById.get(row.customerId);
      const totalInvoiced = row._sum.total ?? ZERO;
      const totalPaid = row._sum.amountPaid ?? ZERO;
      const totalCredited = row._sum.amountCredited ?? ZERO;
      const totalCreditNotes = creditNotesByCustomer.get(row.customerId) ?? ZERO;
      return {
        customerId: row.customerId,
        customerCode: customer?.code ?? '',
        customerName: customer?.name ?? '',
        totalInvoiced,
        totalPaid,
        totalCredited,
        totalCreditNotes,
        outstandingInvoiceCount: outstandingCountByCustomer.get(row.customerId) ?? 0,
      };
    });

    const filtered = onlyOutstanding
      ? rows.filter((row) =>
          row.totalInvoiced
            .minus(row.totalPaid)
            .minus(row.totalCredited)
            .minus(row.totalCreditNotes)
            .greaterThan(0),
        )
      : rows;

    filtered.sort((a, b) => a.customerName.localeCompare(b.customerName));

    return { items: filtered.map(toCustomerArSummary) };
  }

  async getCustomerSummary(actor: ActorContext, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId: actor.tenantId },
      select: { id: true, code: true, name: true },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const agg = await this.prisma.salesInvoice.aggregate({
      where: { tenantId: actor.tenantId, customerId, status: 'SENT' },
      _sum: { total: true, amountPaid: true, amountCredited: true },
    });
    const outstandingInvoiceCount = await this.prisma.salesInvoice.count({
      where: {
        tenantId: actor.tenantId,
        customerId,
        status: 'SENT',
        paymentStatus: { not: 'PAID' },
      },
    });
    const creditNoteAgg = await this.prisma.salesCreditNote.aggregate({
      where: { tenantId: actor.tenantId, customerId, status: 'POSTED' },
      _sum: { total: true },
    });

    return toCustomerArSummary({
      customerId: customer.id,
      customerCode: customer.code,
      customerName: customer.name,
      totalInvoiced: agg._sum.total ?? ZERO,
      totalPaid: agg._sum.amountPaid ?? ZERO,
      totalCredited: agg._sum.amountCredited ?? ZERO,
      totalCreditNotes: creditNoteAgg._sum.total ?? ZERO,
      outstandingInvoiceCount,
    });
  }

  async listInvoices(actor: ActorContext, query: ArInvoiceListQueryDto) {
    const includePayments = query.includePayments === 'true';
    const status = query.status ?? 'SENT';

    const invoices = await this.prisma.salesInvoice.findMany({
      where: {
        tenantId: actor.tenantId,
        ...(query.customerId ? { customerId: query.customerId } : {}),
        status,
        ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
      },
      include: { payments: { orderBy: { paymentDate: 'asc' } } },
      orderBy: [{ invoiceDate: 'asc' }, { invoiceNumber: 'asc' }],
    });

    return {
      items: invoices.map((invoice) =>
        toCustomerArLedgerItem({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          customerId: invoice.customerId,
          customerName: invoice.customerName,
          invoiceDate: invoice.invoiceDate,
          dueDate: invoice.dueDate,
          total: invoice.total,
          amountPaid: invoice.amountPaid,
          amountCredited: invoice.amountCredited,
          paymentStatus: invoice.paymentStatus,
          status: invoice.status,
          payments: includePayments
            ? invoice.payments.map((payment) => ({
                id: payment.id,
                amount: payment.amount,
                paymentDate: payment.paymentDate,
              }))
            : undefined,
        }),
      ),
    };
  }

  async getAging(actor: ActorContext, query: ArAgingQueryDto) {
    const asOfDate = query.asOfDate ?? new Date().toISOString().slice(0, 10);
    const asOfMidnight = utcMidnight(asOfDate);

    const invoices = await this.prisma.salesInvoice.findMany({
      where: {
        tenantId: actor.tenantId,
        status: 'SENT',
        paymentStatus: { not: 'PAID' },
        ...(query.customerId ? { customerId: query.customerId } : {}),
      },
    });

    const totalsByBucket: Record<ArAgingBucket, Prisma.Decimal> = {
      CURRENT: ZERO,
      DAYS_1_30: ZERO,
      DAYS_31_60: ZERO,
      DAYS_61_90: ZERO,
      DAYS_90_PLUS: ZERO,
    };

    const items = invoices.map((invoice) => {
      const effectiveDueDate = invoice.dueDate ?? invoice.invoiceDate;
      const agingBasis: ArAgingBasis = invoice.dueDate ? 'DUE_DATE' : 'INVOICE_DATE_FALLBACK';
      const effectiveDueMidnight = utcMidnight(effectiveDueDate.toISOString().slice(0, 10));
      const daysOverdue = Math.round(
        (asOfMidnight.getTime() - effectiveDueMidnight.getTime()) / 86_400_000,
      );
      const bucket = bucketFor(daysOverdue);
      const balanceDue = invoice.total.minus(invoice.amountPaid).minus(invoice.amountCredited);
      totalsByBucket[bucket] = totalsByBucket[bucket].plus(balanceDue);

      return {
        row: toArAgingRow({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          customerId: invoice.customerId,
          customerName: invoice.customerName,
          invoiceDate: invoice.invoiceDate,
          dueDate: invoice.dueDate,
          effectiveDueDate,
          agingBasis,
          balanceDue,
          daysOverdue,
          bucket,
        }),
        daysOverdue,
      };
    });

    items.sort((a, b) => b.daysOverdue - a.daysOverdue);

    return {
      asOfDate,
      items: items.map((item) => item.row),
      totalsByBucket: Object.fromEntries(
        AR_AGING_BUCKETS.map((bucket) => [bucket, moneyToString(totalsByBucket[bucket])]),
      ) as Record<ArAgingBucket, string>,
    };
  }

  async getStatement(actor: ActorContext, customerId: string, query: ArStatementQueryDto) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId: actor.tenantId },
      select: { id: true, name: true },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const fromDate = query.fromDate ? utcMidnight(query.fromDate) : null;
    const toDateExclusive = query.toDate
      ? utcMidnightExclusiveUpperBound(query.toDate)
      : null;
    if (fromDate && toDateExclusive && fromDate >= toDateExclusive) {
      throw new BadRequestException('fromDate must not be after toDate');
    }

    const page = query.page;
    const limit = query.limit;
    const offset = (page - 1) * limit;

    const openingBalance = fromDate
      ? await this.signedBalanceBefore(actor, customerId, fromDate)
      : ZERO;

    const lines = this.statementLinesCte(actor, customerId, fromDate, toDateExclusive);

    const aggRows = await this.prisma.$queryRaw<{ signed: string | null; cnt: number }[]>(
      Prisma.sql`
        WITH lines AS (${lines})
        SELECT SUM(amount)::text AS signed, COUNT(*)::int AS cnt FROM lines
      `,
    );
    const windowSigned = aggRows[0]?.signed ? new Prisma.Decimal(aggRows[0].signed) : ZERO;
    const total = aggRows[0]?.cnt ?? 0;
    const closingBalance = openingBalance.plus(windowSigned);

    const rows = await this.prisma.$queryRaw<CustomerArStatementRawRow[]>(Prisma.sql`
      WITH lines AS (${lines})
      SELECT
        id,
        date,
        type,
        reference,
        description,
        amount,
        SUM(amount) OVER (
          ORDER BY date, type, id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS cumulative
      FROM lines
      ORDER BY date, type, id
      LIMIT ${limit} OFFSET ${offset}
    `);

    return toCustomerArStatement({
      customerId: customer.id,
      customerName: customer.name,
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

  async getReconciliation(actor: ActorContext) {
    const agg = await this.prisma.salesInvoice.aggregate({
      where: { tenantId: actor.tenantId, status: 'SENT' },
      _sum: { total: true, amountPaid: true, amountCredited: true },
    });
    // Phase 3.14 — algebraically equivalent to "posted credit notes minus
    // reversed credit notes" (a credit note that is later reversed no
    // longer reduces AR): filtering to status POSTED already excludes
    // REVERSED rows entirely, so there is nothing left to add back. Mirrors
    // amountCredited's own SalesReturn-maintained running total (never
    // re-summed from scratch minus a separate reversal total).
    const creditNoteAgg = await this.prisma.salesCreditNote.aggregate({
      where: { tenantId: actor.tenantId, status: 'POSTED' },
      _sum: { total: true },
    });
    const subledgerTotalOutstanding = (agg._sum.total ?? ZERO)
      .minus(agg._sum.amountPaid ?? ZERO)
      .minus(agg._sum.amountCredited ?? ZERO)
      .minus(creditNoteAgg._sum.total ?? ZERO);

    const mapping = await this.ledgerClient.findAccountsReceivableMapping(actor);
    if (!mapping) {
      return toArReconciliationSummary({
        subledgerTotalOutstanding,
        glAccountId: null,
        glAccountsReceivableBalance: null,
      });
    }

    const balance = await this.ledgerClient.getAccountBalance(actor, mapping.accountId);
    return toArReconciliationSummary({
      subledgerTotalOutstanding,
      glAccountId: mapping.accountId,
      glAccountsReceivableBalance: new Prisma.Decimal(balance),
    });
  }

  private async signedBalanceBefore(
    actor: ActorContext,
    customerId: string,
    beforeDate: Date,
  ): Promise<Prisma.Decimal> {
    const invoiceAgg = await this.prisma.salesInvoice.aggregate({
      where: {
        tenantId: actor.tenantId,
        customerId,
        status: 'SENT',
        invoiceDate: { lt: beforeDate },
      },
      _sum: { total: true },
    });
    const paymentAgg = await this.prisma.salesPayment.aggregate({
      where: {
        tenantId: actor.tenantId,
        salesInvoice: { tenantId: actor.tenantId, customerId },
        paymentDate: { lt: beforeDate },
      },
      _sum: { amount: true },
    });

    const invoiceTotal = invoiceAgg._sum.total ?? ZERO;
    const paymentTotal = paymentAgg._sum.amount ?? ZERO;
    const creditTotal = await this.confirmedCreditTotalBefore(actor, customerId, beforeDate);
    // Phase 3.14 — mirrors confirmedCreditTotalBefore's role for SalesReturn:
    // a Credit Note posted before beforeDate always counted against the
    // balance at that point in time, and if it was ALSO reversed before
    // beforeDate, the reversal line adds that amount back — regardless of
    // the credit note's CURRENT status (unlike the current-outstanding
    // aggregates above, this is a point-in-time balance).
    const creditNoteAgg = await this.prisma.salesCreditNote.aggregate({
      where: {
        tenantId: actor.tenantId,
        customerId,
        status: { in: ['POSTED', 'REVERSED'] },
        creditNoteDate: { lt: beforeDate },
      },
      _sum: { total: true },
    });
    const creditNoteReversalAgg = await this.prisma.salesCreditNote.aggregate({
      where: {
        tenantId: actor.tenantId,
        customerId,
        status: 'REVERSED',
        reversedAt: { lt: beforeDate },
      },
      _sum: { total: true },
    });
    const creditNoteTotal = creditNoteAgg._sum.total ?? ZERO;
    const creditNoteReversalTotal = creditNoteReversalAgg._sum.total ?? ZERO;
    return invoiceTotal
      .minus(paymentTotal)
      .minus(creditTotal)
      .minus(creditNoteTotal)
      .plus(creditNoteReversalTotal);
  }

  /** Sum of each CONFIRMED Sales Return's own AR-side amount (the sum of its
   * invoice-linked lines' lineTotal) — SalesReturn itself has no persisted
   * header-level total, so this sums via its items, mirroring how the return
   * document computes amountCredited at confirm()/reverse() time. */
  private async confirmedCreditTotalBefore(
    actor: ActorContext,
    customerId: string,
    beforeDate: Date,
  ): Promise<Prisma.Decimal> {
    const rows = await this.prisma.salesReturnItem.aggregate({
      where: {
        tenantId: actor.tenantId,
        salesInvoiceItemId: { not: null },
        salesReturn: {
          tenantId: actor.tenantId,
          status: 'CONFIRMED',
          returnedAt: { lt: beforeDate },
          salesInvoice: { tenantId: actor.tenantId, customerId },
        },
      },
      _sum: { lineTotal: true },
    });
    return rows._sum.lineTotal ?? ZERO;
  }

  /** The four-way UNION behind the customer AR statement: every SENT invoice
   * (+total, on invoiceDate) as an INVOICE line, every payment (-amount, on
   * paymentDate) as a PAYMENT line, every CONFIRMED Sales Return's
   * invoice-linked lines (-total, on returnedAt) as a CREDIT_NOTE line
   * (Phase 3.12), and every ever-POSTED standalone Sales Credit Note
   * (-total, on creditNoteDate, regardless of current status) as a
   * SALES_CREDIT_NOTE line plus every REVERSED one additionally (+total, on
   * reversedAt) as a SALES_CREDIT_NOTE_REVERSAL line (Phase 3.14) — the
   * exact mirror of the PAYMENT/PAYMENT_REVERSAL pair used on the Purchase
   * side. Deliberately a DISTINCT type from CREDIT_NOTE above: a standalone
   * Sales Credit Note is not a SalesReturn (see SalesCreditNote's own model
   * comment). No PAYMENT_REVERSAL line type here — unlike Supplier Payment,
   * Sales Payment's reversal lifecycle (Phase 3.11) is not yet reflected in
   * this statement — a pre-existing gap that predates Phase 3.14 and is out
   * of this phase's scope (documented, not fixed here). */
  private statementLinesCte(
    actor: ActorContext,
    customerId: string,
    fromDate: Date | null,
    toDateExclusive: Date | null,
  ): Prisma.Sql {
    return Prisma.sql`
      SELECT
        si.id AS id,
        si."invoiceDate" AS date,
        'INVOICE' AS type,
        si."invoiceNumber" AS reference,
        si.notes AS description,
        si.total AS amount
      FROM sales_invoices si
      WHERE si."tenantId" = ${actor.tenantId}::uuid
        AND si."customerId" = ${customerId}::uuid
        AND si.status = 'SENT'::"SalesInvoiceStatus"
        AND (${fromDate}::timestamptz IS NULL OR si."invoiceDate" >= ${fromDate}::timestamptz)
        AND (${toDateExclusive}::timestamptz IS NULL OR si."invoiceDate" < ${toDateExclusive}::timestamptz)

      UNION ALL

      SELECT
        sp.id AS id,
        sp."paymentDate" AS date,
        'PAYMENT' AS type,
        COALESCE(sp.reference, '') AS reference,
        sp.notes AS description,
        -sp.amount AS amount
      FROM sales_payments sp
      JOIN sales_invoices si ON si.id = sp."salesInvoiceId"
      WHERE sp."tenantId" = ${actor.tenantId}::uuid
        AND si."tenantId" = ${actor.tenantId}::uuid
        AND si."customerId" = ${customerId}::uuid
        AND (${fromDate}::timestamptz IS NULL OR sp."paymentDate" >= ${fromDate}::timestamptz)
        AND (${toDateExclusive}::timestamptz IS NULL OR sp."paymentDate" < ${toDateExclusive}::timestamptz)

      UNION ALL

      -- Phase 3.12 (Sales Return / Credit Note) — only CONFIRMED returns
      -- (a later-REVERSED return simply stops appearing, its net effect on
      -- amountCredited already zero — mirrors the PAYMENT line above having
      -- no PAYMENT_REVERSAL counterpart). Amount is the sum of this return's
      -- own invoice-linked lines' lineTotal (SalesReturn has no persisted
      -- header total; shipment-only lines never contribute to the AR side).
      SELECT
        sr.id AS id,
        sr."returnedAt" AS date,
        'CREDIT_NOTE' AS type,
        sr."returnNumber" AS reference,
        sr.reason AS description,
        -COALESCE(sri_sum.total, 0) AS amount
      FROM sales_returns sr
      JOIN sales_invoices si ON si.id = sr."salesInvoiceId"
      JOIN LATERAL (
        SELECT SUM(sri."lineTotal") AS total
        FROM sales_return_items sri
        WHERE sri."salesReturnId" = sr.id AND sri."salesInvoiceItemId" IS NOT NULL
      ) sri_sum ON true
      WHERE sr."tenantId" = ${actor.tenantId}::uuid
        AND si."tenantId" = ${actor.tenantId}::uuid
        AND si."customerId" = ${customerId}::uuid
        AND sr.status = 'CONFIRMED'::"SalesReturnStatus"
        AND sr."returnedAt" IS NOT NULL
        AND (${fromDate}::timestamptz IS NULL OR sr."returnedAt" >= ${fromDate}::timestamptz)
        AND (${toDateExclusive}::timestamptz IS NULL OR sr."returnedAt" < ${toDateExclusive}::timestamptz)

      UNION ALL

      SELECT
        scn.id AS id,
        scn."creditNoteDate" AS date,
        'SALES_CREDIT_NOTE' AS type,
        scn."creditNoteNumber" AS reference,
        scn.reason AS description,
        -scn.total AS amount
      FROM sales_credit_notes scn
      WHERE scn."tenantId" = ${actor.tenantId}::uuid
        AND scn."customerId" = ${customerId}::uuid
        AND scn.status IN ('POSTED'::"SalesCreditNoteStatus", 'REVERSED'::"SalesCreditNoteStatus")
        AND (${fromDate}::timestamptz IS NULL OR scn."creditNoteDate" >= ${fromDate}::timestamptz)
        AND (${toDateExclusive}::timestamptz IS NULL OR scn."creditNoteDate" < ${toDateExclusive}::timestamptz)

      UNION ALL

      SELECT
        scn.id AS id,
        scn."reversedAt" AS date,
        'SALES_CREDIT_NOTE_REVERSAL' AS type,
        scn."creditNoteNumber" AS reference,
        scn."reversalReason" AS description,
        scn.total AS amount
      FROM sales_credit_notes scn
      WHERE scn."tenantId" = ${actor.tenantId}::uuid
        AND scn."customerId" = ${customerId}::uuid
        AND scn.status = 'REVERSED'::"SalesCreditNoteStatus"
        AND scn."reversedAt" IS NOT NULL
        AND (${fromDate}::timestamptz IS NULL OR scn."reversedAt" >= ${fromDate}::timestamptz)
        AND (${toDateExclusive}::timestamptz IS NULL OR scn."reversedAt" < ${toDateExclusive}::timestamptz)
    `;
  }
}
