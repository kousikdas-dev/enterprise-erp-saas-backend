import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma-client';
import { AccountingLedgerClient } from '../accounting/accounting-ledger.client';
import { ActorContext } from '../auth/actor-context';
import { moneyToString } from '../common/decimal';
import { PrismaService } from '../prisma/prisma.service';
import {
  ApAgingBasis,
  ApAgingBucket,
  AP_AGING_BUCKETS,
  SupplierApStatementRawRow,
  toApAgingRow,
  toApReconciliationSummary,
  toSupplierApLedgerItem,
  toSupplierApStatement,
  toSupplierApSummary,
} from './dto/accounts-payable-response';
import {
  ApAgingQueryDto,
  ApInvoiceListQueryDto,
  ApStatementQueryDto,
} from './dto/accounts-payable.dto';

const ZERO = new Prisma.Decimal(0);

/** UTC midnight of a YYYY-MM-DD date-only string — same convention as
 * accounting-service's AccountLedgerService (no tenant-timezone concept
 * exists anywhere in this codebase). Duplicated rather than imported: these
 * are separate microservices/deployments with no shared runtime code. */
function utcMidnight(dateOnly: string): Date {
  return new Date(`${dateOnly}T00:00:00.000Z`);
}

function utcMidnightExclusiveUpperBound(dateOnly: string): Date {
  const day = utcMidnight(dateOnly);
  day.setUTCDate(day.getUTCDate() + 1);
  return day;
}

function bucketFor(daysOverdue: number): ApAgingBucket {
  if (daysOverdue <= 0) return 'CURRENT';
  if (daysOverdue <= 30) return 'DAYS_1_30';
  if (daysOverdue <= 60) return 'DAYS_31_60';
  if (daysOverdue <= 90) return 'DAYS_61_90';
  return 'DAYS_90_PLUS';
}

@Injectable()
export class AccountsPayableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerClient: AccountingLedgerClient,
  ) {}

  async listSupplierSummaries(actor: ActorContext, onlyOutstanding: boolean) {
    const grouped = await this.prisma.purchaseInvoice.groupBy({
      by: ['supplierId'],
      where: { tenantId: actor.tenantId, status: 'CONFIRMED' },
      _sum: { total: true, amountPaid: true },
    });
    if (grouped.length === 0) {
      return { items: [] };
    }

    const outstandingCounts = await this.prisma.purchaseInvoice.groupBy({
      by: ['supplierId'],
      where: {
        tenantId: actor.tenantId,
        status: 'CONFIRMED',
        paymentStatus: { not: 'PAID' },
      },
      _count: { _all: true },
    });
    const outstandingCountBySupplier = new Map(
      outstandingCounts.map((row) => [row.supplierId, row._count._all]),
    );

    const supplierIds = grouped.map((row) => row.supplierId);
    const suppliers = await this.prisma.supplier.findMany({
      where: { tenantId: actor.tenantId, id: { in: supplierIds } },
      select: { id: true, code: true, name: true },
    });
    const supplierById = new Map(suppliers.map((row) => [row.id, row]));

    const rows = grouped.map((row) => {
      const supplier = supplierById.get(row.supplierId);
      const totalInvoiced = row._sum.total ?? ZERO;
      const totalPaid = row._sum.amountPaid ?? ZERO;
      return {
        supplierId: row.supplierId,
        supplierCode: supplier?.code ?? '',
        supplierName: supplier?.name ?? '',
        totalInvoiced,
        totalPaid,
        outstandingInvoiceCount: outstandingCountBySupplier.get(row.supplierId) ?? 0,
      };
    });

    const filtered = onlyOutstanding
      ? rows.filter((row) => row.totalInvoiced.minus(row.totalPaid).greaterThan(0))
      : rows;

    filtered.sort((a, b) => a.supplierName.localeCompare(b.supplierName));

    return { items: filtered.map(toSupplierApSummary) };
  }

  async getSupplierSummary(actor: ActorContext, supplierId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, tenantId: actor.tenantId },
      select: { id: true, code: true, name: true },
    });
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    const agg = await this.prisma.purchaseInvoice.aggregate({
      where: { tenantId: actor.tenantId, supplierId, status: 'CONFIRMED' },
      _sum: { total: true, amountPaid: true },
    });
    const outstandingInvoiceCount = await this.prisma.purchaseInvoice.count({
      where: {
        tenantId: actor.tenantId,
        supplierId,
        status: 'CONFIRMED',
        paymentStatus: { not: 'PAID' },
      },
    });

    return toSupplierApSummary({
      supplierId: supplier.id,
      supplierCode: supplier.code,
      supplierName: supplier.name,
      totalInvoiced: agg._sum.total ?? ZERO,
      totalPaid: agg._sum.amountPaid ?? ZERO,
      outstandingInvoiceCount,
    });
  }

  async listInvoices(actor: ActorContext, query: ApInvoiceListQueryDto) {
    const includePayments = query.includePayments === 'true';
    const status = query.status ?? 'CONFIRMED';

    const invoices = await this.prisma.purchaseInvoice.findMany({
      where: {
        tenantId: actor.tenantId,
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
        status,
        ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
      },
      include: { payments: { orderBy: { paymentDate: 'asc' } } },
      orderBy: [{ invoiceDate: 'asc' }, { invoiceNumber: 'asc' }],
    });

    return {
      items: invoices.map((invoice) =>
        toSupplierApLedgerItem({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          supplierInvoiceNumber: invoice.supplierInvoiceNumber,
          supplierId: invoice.supplierId,
          supplierName: invoice.supplierName,
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
                status: payment.status,
                reversedAt: payment.reversedAt,
              }))
            : undefined,
        }),
      ),
    };
  }

  async getAging(actor: ActorContext, query: ApAgingQueryDto) {
    const asOfDate = query.asOfDate ?? new Date().toISOString().slice(0, 10);
    const asOfMidnight = utcMidnight(asOfDate);

    const invoices = await this.prisma.purchaseInvoice.findMany({
      where: {
        tenantId: actor.tenantId,
        status: 'CONFIRMED',
        paymentStatus: { not: 'PAID' },
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      },
    });

    const totalsByBucket: Record<ApAgingBucket, Prisma.Decimal> = {
      CURRENT: ZERO,
      DAYS_1_30: ZERO,
      DAYS_31_60: ZERO,
      DAYS_61_90: ZERO,
      DAYS_90_PLUS: ZERO,
    };

    const items = invoices.map((invoice) => {
      const effectiveDueDate = invoice.dueDate ?? invoice.invoiceDate;
      const agingBasis: ApAgingBasis = invoice.dueDate ? 'DUE_DATE' : 'INVOICE_DATE_FALLBACK';
      const effectiveDueMidnight = utcMidnight(effectiveDueDate.toISOString().slice(0, 10));
      const daysOverdue = Math.round(
        (asOfMidnight.getTime() - effectiveDueMidnight.getTime()) / 86_400_000,
      );
      const bucket = bucketFor(daysOverdue);
      const balanceDue = invoice.total.minus(invoice.amountPaid);
      totalsByBucket[bucket] = totalsByBucket[bucket].plus(balanceDue);

      return {
        row: toApAgingRow({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          supplierId: invoice.supplierId,
          supplierName: invoice.supplierName,
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
        AP_AGING_BUCKETS.map((bucket) => [bucket, moneyToString(totalsByBucket[bucket])]),
      ) as Record<ApAgingBucket, string>,
    };
  }

  async getStatement(actor: ActorContext, supplierId: string, query: ApStatementQueryDto) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, tenantId: actor.tenantId },
      select: { id: true, name: true },
    });
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
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
      ? await this.signedBalanceBefore(actor, supplierId, fromDate)
      : ZERO;

    const lines = this.statementLinesCte(actor, supplierId, fromDate, toDateExclusive);

    const aggRows = await this.prisma.$queryRaw<{ signed: string | null; cnt: number }[]>(
      Prisma.sql`
        WITH lines AS (${lines})
        SELECT SUM(amount)::text AS signed, COUNT(*)::int AS cnt FROM lines
      `,
    );
    const windowSigned = aggRows[0]?.signed ? new Prisma.Decimal(aggRows[0].signed) : ZERO;
    const total = aggRows[0]?.cnt ?? 0;
    const closingBalance = openingBalance.plus(windowSigned);

    const rows = await this.prisma.$queryRaw<SupplierApStatementRawRow[]>(Prisma.sql`
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

    return toSupplierApStatement({
      supplierId: supplier.id,
      supplierName: supplier.name,
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
    const agg = await this.prisma.purchaseInvoice.aggregate({
      where: { tenantId: actor.tenantId, status: 'CONFIRMED' },
      _sum: { total: true, amountPaid: true },
    });
    const subledgerTotalOutstanding = (agg._sum.total ?? ZERO).minus(
      agg._sum.amountPaid ?? ZERO,
    );

    const mapping = await this.ledgerClient.findAccountsPayableMapping(actor);
    if (!mapping) {
      return toApReconciliationSummary({
        subledgerTotalOutstanding,
        glAccountId: null,
        glAccountsPayableBalance: null,
      });
    }

    const balance = await this.ledgerClient.getAccountBalance(actor, mapping.accountId);
    return toApReconciliationSummary({
      subledgerTotalOutstanding,
      glAccountId: mapping.accountId,
      glAccountsPayableBalance: new Prisma.Decimal(balance),
    });
  }

  private async signedBalanceBefore(
    actor: ActorContext,
    supplierId: string,
    beforeDate: Date,
  ): Promise<Prisma.Decimal> {
    const invoiceAgg = await this.prisma.purchaseInvoice.aggregate({
      where: {
        tenantId: actor.tenantId,
        supplierId,
        status: 'CONFIRMED',
        invoiceDate: { lt: beforeDate },
      },
      _sum: { total: true },
    });
    const paymentAgg = await this.prisma.supplierPayment.aggregate({
      where: {
        tenantId: actor.tenantId,
        purchaseInvoice: { tenantId: actor.tenantId, supplierId },
        paymentDate: { lt: beforeDate },
      },
      _sum: { amount: true },
    });
    const reversalAgg = await this.prisma.supplierPayment.aggregate({
      where: {
        tenantId: actor.tenantId,
        purchaseInvoice: { tenantId: actor.tenantId, supplierId },
        status: 'REVERSED',
        reversedAt: { lt: beforeDate },
      },
      _sum: { amount: true },
    });

    const invoiceTotal = invoiceAgg._sum.total ?? ZERO;
    const paymentTotal = paymentAgg._sum.amount ?? ZERO;
    const reversalTotal = reversalAgg._sum.amount ?? ZERO;
    return invoiceTotal.minus(paymentTotal).plus(reversalTotal);
  }

  /** The three-way UNION behind the supplier AP statement: every CONFIRMED
   * invoice (+total, on invoiceDate) as an INVOICE line, every payment
   * (-amount, on paymentDate, regardless of status) as a PAYMENT line, and
   * every REVERSED payment additionally (+amount, on reversedAt) as a
   * PAYMENT_REVERSAL line — so a reversed payment always nets to zero
   * across its two lines rather than being silently omitted. */
  private statementLinesCte(
    actor: ActorContext,
    supplierId: string,
    fromDate: Date | null,
    toDateExclusive: Date | null,
  ): Prisma.Sql {
    return Prisma.sql`
      SELECT
        pi.id AS id,
        pi."invoiceDate" AS date,
        'INVOICE' AS type,
        pi."invoiceNumber" AS reference,
        pi.notes AS description,
        pi.total AS amount
      FROM purchase_invoices pi
      WHERE pi."tenantId" = ${actor.tenantId}::uuid
        AND pi."supplierId" = ${supplierId}::uuid
        AND pi.status = 'CONFIRMED'::"PurchaseInvoiceStatus"
        AND (${fromDate}::timestamptz IS NULL OR pi."invoiceDate" >= ${fromDate}::timestamptz)
        AND (${toDateExclusive}::timestamptz IS NULL OR pi."invoiceDate" < ${toDateExclusive}::timestamptz)

      UNION ALL

      SELECT
        sp.id AS id,
        sp."paymentDate" AS date,
        'PAYMENT' AS type,
        COALESCE(sp.reference, '') AS reference,
        sp.notes AS description,
        -sp.amount AS amount
      FROM supplier_payments sp
      JOIN purchase_invoices pi ON pi.id = sp."purchaseInvoiceId"
      WHERE sp."tenantId" = ${actor.tenantId}::uuid
        AND pi."tenantId" = ${actor.tenantId}::uuid
        AND pi."supplierId" = ${supplierId}::uuid
        AND (${fromDate}::timestamptz IS NULL OR sp."paymentDate" >= ${fromDate}::timestamptz)
        AND (${toDateExclusive}::timestamptz IS NULL OR sp."paymentDate" < ${toDateExclusive}::timestamptz)

      UNION ALL

      SELECT
        sp.id AS id,
        sp."reversedAt" AS date,
        'PAYMENT_REVERSAL' AS type,
        COALESCE(sp.reference, '') AS reference,
        sp."reversalReason" AS description,
        sp.amount AS amount
      FROM supplier_payments sp
      JOIN purchase_invoices pi ON pi.id = sp."purchaseInvoiceId"
      WHERE sp."tenantId" = ${actor.tenantId}::uuid
        AND pi."tenantId" = ${actor.tenantId}::uuid
        AND pi."supplierId" = ${supplierId}::uuid
        AND sp.status = 'REVERSED'::"SupplierPaymentStatus"
        AND sp."reversedAt" IS NOT NULL
        AND (${fromDate}::timestamptz IS NULL OR sp."reversedAt" >= ${fromDate}::timestamptz)
        AND (${toDateExclusive}::timestamptz IS NULL OR sp."reversedAt" < ${toDateExclusive}::timestamptz)
    `;
  }
}
