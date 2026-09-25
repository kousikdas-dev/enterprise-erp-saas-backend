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
      _sum: { total: true, amountPaid: true },
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
      return {
        customerId: row.customerId,
        customerCode: customer?.code ?? '',
        customerName: customer?.name ?? '',
        totalInvoiced,
        totalPaid,
        outstandingInvoiceCount: outstandingCountByCustomer.get(row.customerId) ?? 0,
      };
    });

    const filtered = onlyOutstanding
      ? rows.filter((row) => row.totalInvoiced.minus(row.totalPaid).greaterThan(0))
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
      _sum: { total: true, amountPaid: true },
    });
    const outstandingInvoiceCount = await this.prisma.salesInvoice.count({
      where: {
        tenantId: actor.tenantId,
        customerId,
        status: 'SENT',
        paymentStatus: { not: 'PAID' },
      },
    });

    return toCustomerArSummary({
      customerId: customer.id,
      customerCode: customer.code,
      customerName: customer.name,
      totalInvoiced: agg._sum.total ?? ZERO,
      totalPaid: agg._sum.amountPaid ?? ZERO,
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
      const balanceDue = invoice.total.minus(invoice.amountPaid);
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
      _sum: { total: true, amountPaid: true },
    });
    const subledgerTotalOutstanding = (agg._sum.total ?? ZERO).minus(
      agg._sum.amountPaid ?? ZERO,
    );

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
    return invoiceTotal.minus(paymentTotal);
  }

  /** The two-way UNION behind the customer AR statement: every SENT invoice
   * (+total, on invoiceDate) as an INVOICE line, every payment (-amount, on
   * paymentDate) as a PAYMENT line. No PAYMENT_REVERSAL line type — unlike
   * Supplier Payment, Sales Payment has no reversal lifecycle in this
   * phase, so there is nothing to offset. */
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
    `;
  }
}
