import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SalesCreditNotePostingStatus,
  SalesCreditNoteStatus,
  SalesInvoiceStatus,
} from '../../generated/prisma-client';
import {
  AccountingJournalClient,
  CreateJournalPostingRequest,
} from '../accounting/accounting-journal.client';
import { AccountingTaxCodeClient } from '../accounting/accounting-tax-code.client';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { ActorContext, RequestAuditMeta } from '../auth/actor-context';
import {
  moneyToString,
  parseMoney,
  parsePercent,
  parsePositiveDecimal,
  roundMoney,
} from '../common/decimal';
import { isUniqueConstraintError } from '../prisma/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateSalesCreditNoteDto,
  CreateSalesCreditNoteItemDto,
} from './dto/sales-credit-note.dto';
import { toSalesCreditNoteResponse } from './dto/sales-credit-note-response';
import { ReverseSalesCreditNoteDto } from './dto/reverse-sales-credit-note.dto';

const ACCOUNTING_SOURCE_SERVICE = 'sales-service';

const CREDIT_NOTE_INCLUDE = {
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      taxComponents: { orderBy: { sequence: 'asc' as const } },
    },
  },
};

type CreditNoteWithItems = Prisma.SalesCreditNoteGetPayload<{
  include: typeof CREDIT_NOTE_INCLUDE;
}>;

interface CreditNoteLineTaxComponent {
  sequence: number;
  type: string;
  name: string | null;
  rate: Prisma.Decimal;
  componentTaxAmount: Prisma.Decimal;
}

interface CreditNoteLine {
  description: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  gross: Prisma.Decimal;
  discountPercent: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  taxCodeId: string | null;
  taxCode: string | null;
  taxCodeName: string | null;
  taxAmount: Prisma.Decimal;
  lineSubtotal: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  taxComponents: CreditNoteLineTaxComponent[];
}

/**
 * Standalone Sales Credit Note V1 (Phase 3.14) — a standalone Accounts
 * Receivable adjustment document, deliberately independent of SalesReturn/
 * Shipment/ShipmentItem. Never calls InventoryStockClient: no physical goods
 * movement is ever associated with a Credit Note, and it never touches
 * SalesInvoice.amountCredited (that column remains exclusively owned by
 * SalesReturnsService). salesInvoiceId is optional, retained only as
 * traceability when supplied.
 *
 * Document-level lifecycle: DRAFT -> POSTED -> REVERSED, mirroring
 * PurchaseDebitNotesService's own post()/reverse() idempotency conventions
 * (already-POSTED post() and already-REVERSED reverse() are no-ops; a failed
 * accounting reversal never introduces a new "reversal failed" status).
 * Accounting posting/reversal mirror SalesInvoicesService/SalesReturnsService's
 * own post-commit, best-effort, never-throws-from-the-caller's-perspective
 * pattern.
 */
@Injectable()
export class SalesCreditNotesService {
  private readonly logger = new Logger(SalesCreditNotesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountingTaxCodes: AccountingTaxCodeClient,
    private readonly accountingJournal: AccountingJournalClient,
    private readonly audit: IdentityAuditClient,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreateSalesCreditNoteDto,
    request?: RequestAuditMeta,
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, tenantId: actor.tenantId },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    let customerBillingAddress: string | null = null;
    let invoiceId: string | null = null;
    if (dto.salesInvoiceId) {
      const invoice = await this.prisma.salesInvoice.findFirst({
        where: { id: dto.salesInvoiceId, tenantId: actor.tenantId },
        select: {
          id: true,
          status: true,
          customerId: true,
          billingAddress: true,
        },
      });
      if (!invoice) throw new NotFoundException('Sales invoice not found');
      if (invoice.customerId !== customer.id) {
        throw new BadRequestException(
          'Sales invoice does not belong to the selected customer',
        );
      }
      if (invoice.status !== SalesInvoiceStatus.SENT) {
        throw new ConflictException('Referenced sales invoice must be SENT');
      }
      invoiceId = invoice.id;
      customerBillingAddress = invoice.billingAddress ?? null;
    }

    const lines = await this.resolveLines(actor, dto.items);
    const totals = this.sumTotals(lines);
    if (totals.total.lte(0)) {
      throw new BadRequestException(
        'Sales credit note total must be greater than zero',
      );
    }
    const creditNoteDate = dto.creditNoteDate ? new Date(dto.creditNoteDate) : new Date();

    for (let attempt = 0; attempt < 5; attempt++) {
      const creditNoteNumber = await this.nextCreditNoteNumber(actor.tenantId);
      try {
        const row = await this.prisma.salesCreditNote.create({
          data: {
            tenantId: actor.tenantId,
            creditNoteNumber,
            customerId: customer.id,
            customerName: customer.name,
            customerGstin: customer.gstin,
            customerBillingAddress,
            salesInvoiceId: invoiceId,
            creditNoteDate,
            reason: dto.reason?.trim() || null,
            notes: dto.notes?.trim() || null,
            subtotal: totals.subtotal,
            discountTotal: totals.discountTotal,
            taxTotal: totals.taxTotal,
            total: totals.total,
            createdBy: actor.userId,
            items: {
              create: lines.map((line) => this.toItemCreateData(actor.tenantId, line)),
            },
          },
          include: CREDIT_NOTE_INCLUDE,
        });
        await this.audit.record({
          actor,
          action: 'sales-credit-note.created',
          resource: 'sales-credit-note',
          resourceId: row.id,
          metadata: {
            creditNoteNumber: row.creditNoteNumber,
            customerId: row.customerId,
            salesInvoiceId: row.salesInvoiceId,
            total: moneyToString(row.total),
          },
          request,
        });
        return toSalesCreditNoteResponse(row);
      } catch (error) {
        if (isUniqueConstraintError(error) && attempt < 4) {
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException('Could not allocate sales credit note number');
  }

  async list(actor: ActorContext) {
    const rows = await this.prisma.salesCreditNote.findMany({
      where: { tenantId: actor.tenantId },
      include: CREDIT_NOTE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return { items: rows.map(toSalesCreditNoteResponse) };
  }

  async getById(actor: ActorContext, id: string) {
    return toSalesCreditNoteResponse(await this.require(actor, id));
  }

  /**
   * DRAFT -> POSTED. Idempotent: re-invoking on an already-POSTED credit note
   * is a no-op that never re-attempts the accounting posting (mirrors
   * PurchaseDebitNotesService.post()). REVERSED is a hard conflict — a
   * reversed document can never be re-posted.
   */
  async post(actor: ActorContext, id: string, request?: RequestAuditMeta) {
    const existing = await this.require(actor, id);
    if (existing.status === SalesCreditNoteStatus.POSTED) {
      return toSalesCreditNoteResponse(existing);
    }
    if (existing.status !== SalesCreditNoteStatus.DRAFT) {
      throw new ConflictException('Only a DRAFT sales credit note can be posted');
    }

    const posted = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>(
        Prisma.sql`
          SELECT id, status::text AS status
          FROM sales_credit_notes
          WHERE id = ${id}::uuid AND "tenantId" = ${actor.tenantId}::uuid
          FOR UPDATE
        `,
      );
      const locked = rows[0];
      if (!locked) throw new NotFoundException('Sales credit note not found');
      if (locked.status === SalesCreditNoteStatus.POSTED) {
        return tx.salesCreditNote.findFirstOrThrow({
          where: { id, tenantId: actor.tenantId },
          include: CREDIT_NOTE_INCLUDE,
        });
      }
      if (locked.status !== SalesCreditNoteStatus.DRAFT) {
        throw new ConflictException('Only a DRAFT sales credit note can be posted');
      }
      return tx.salesCreditNote.update({
        where: { id },
        data: {
          status: SalesCreditNoteStatus.POSTED,
          postedAt: new Date(),
          postedBy: actor.userId,
        },
        include: CREDIT_NOTE_INCLUDE,
      });
    });

    await this.audit.record({
      actor,
      action: 'sales-credit-note.posted',
      resource: 'sales-credit-note',
      resourceId: posted.id,
      metadata: { total: moneyToString(posted.total) },
      request,
    });

    const { creditNote: finalRow } = await this.attemptCreditNotePosting(
      actor,
      posted,
      request,
    );
    return toSalesCreditNoteResponse(finalRow);
  }

  /**
   * Manual retry for a POSTED credit note whose accounting posting is
   * currently FAILED (or never attempted). Mirrors
   * PurchaseDebitNotesService.retryAccountingPosting() exactly: a failure
   * here IS surfaced to the caller, unlike post()'s post-commit best-effort
   * call.
   */
  async retryAccountingPosting(
    actor: ActorContext,
    id: string,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.require(actor, id);
    if (existing.status !== SalesCreditNoteStatus.POSTED) {
      throw new ConflictException(
        'Only a POSTED sales credit note can have its accounting posting retried',
      );
    }
    if (existing.accountingPostingStatus === SalesCreditNotePostingStatus.POSTED) {
      return toSalesCreditNoteResponse(existing);
    }

    const { creditNote, error } = await this.attemptCreditNotePosting(
      actor,
      existing,
      request,
    );
    if (error) throw error;

    await this.audit.record({
      actor,
      action: 'sales-credit-note.accounting-posting-retried',
      resource: 'sales-credit-note',
      resourceId: creditNote.id,
      metadata: { journalEntryId: creditNote.journalEntryId },
      request,
    });

    return toSalesCreditNoteResponse(creditNote);
  }

  /**
   * POSTED -> REVERSED. Never deletes the document, never VOIDs the
   * original journal (that stays POSTED permanently — a separate accounting
   * reversal journal is created instead). Idempotent: re-invoking on an
   * already-REVERSED credit note is a no-op that never re-calls
   * accounting-service. DRAFT cannot be reversed. Mirrors
   * PurchaseDebitNotesService.reverse() exactly.
   */
  async reverse(
    actor: ActorContext,
    id: string,
    dto: ReverseSalesCreditNoteDto,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.require(actor, id);
    if (existing.status === SalesCreditNoteStatus.REVERSED) {
      return toSalesCreditNoteResponse(existing);
    }
    if (existing.status !== SalesCreditNoteStatus.POSTED) {
      throw new ConflictException('Only a POSTED sales credit note can be reversed');
    }

    const reversed = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>(
        Prisma.sql`
          SELECT id, status::text AS status
          FROM sales_credit_notes
          WHERE id = ${id}::uuid AND "tenantId" = ${actor.tenantId}::uuid
          FOR UPDATE
        `,
      );
      const locked = rows[0];
      if (!locked) throw new NotFoundException('Sales credit note not found');
      if (locked.status === SalesCreditNoteStatus.REVERSED) {
        return tx.salesCreditNote.findFirstOrThrow({
          where: { id, tenantId: actor.tenantId },
          include: CREDIT_NOTE_INCLUDE,
        });
      }
      if (locked.status !== SalesCreditNoteStatus.POSTED) {
        throw new ConflictException('Only a POSTED sales credit note can be reversed');
      }
      return tx.salesCreditNote.update({
        where: { id },
        data: {
          status: SalesCreditNoteStatus.REVERSED,
          reversedAt: new Date(),
          reversedBy: actor.userId,
          reversalReason: dto.reason?.trim() || null,
        },
        include: CREDIT_NOTE_INCLUDE,
      });
    });

    await this.audit.record({
      actor,
      action: 'sales-credit-note.reversed',
      resource: 'sales-credit-note',
      resourceId: reversed.id,
      metadata: { reason: dto.reason?.trim() || null },
      request,
    });

    let finalRow = reversed;
    if (
      reversed.accountingPostingStatus === SalesCreditNotePostingStatus.POSTED &&
      reversed.journalEntryId
    ) {
      const { creditNote: withReversal } = await this.attemptCreditNoteReversal(
        actor,
        reversed,
        request,
      );
      finalRow = withReversal;
    }

    return toSalesCreditNoteResponse(finalRow);
  }

  /**
   * Manual retry for a REVERSED credit note whose accounting reversal
   * (attempted post-commit inside reverse()) failed. Mirrors
   * PurchaseDebitNotesService.retryAccountingReversal() exactly.
   */
  async retryAccountingReversal(
    actor: ActorContext,
    id: string,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.require(actor, id);
    if (existing.status !== SalesCreditNoteStatus.REVERSED) {
      throw new ConflictException(
        'Only a REVERSED sales credit note can have its accounting reversal retried',
      );
    }
    if (existing.accountingPostingStatus === SalesCreditNotePostingStatus.REVERSED) {
      return toSalesCreditNoteResponse(existing);
    }
    if (
      existing.accountingPostingStatus !== SalesCreditNotePostingStatus.POSTED ||
      !existing.journalEntryId
    ) {
      throw new ConflictException(
        'This sales credit note has no posted accounting journal to reverse',
      );
    }

    const { creditNote, error } = await this.attemptCreditNoteReversal(
      actor,
      existing,
      request,
    );
    if (error) throw error;

    await this.audit.record({
      actor,
      action: 'sales-credit-note.accounting-reversal-retried',
      resource: 'sales-credit-note',
      resourceId: creditNote.id,
      metadata: { reversalJournalEntryId: creditNote.reversalJournalEntryId },
      request,
    });

    return toSalesCreditNoteResponse(creditNote);
  }

  private async require(actor: ActorContext, id: string): Promise<CreditNoteWithItems> {
    const row = await this.prisma.salesCreditNote.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: CREDIT_NOTE_INCLUDE,
    });
    if (!row) throw new NotFoundException('Sales credit note not found');
    return row;
  }

  /**
   * Mirrors SalesOrdersService.mapLines()'s tax handling exactly (resolve
   * taxCodeId fresh via AccountingTaxCodeClient, snapshot components,
   * recompute against this line's own lineSubtotal) — there is no order/
   * invoice line to copy a tax snapshot from, unlike SalesInvoiceItem.
   */
  private async resolveLines(
    actor: ActorContext,
    items: CreateSalesCreditNoteItemDto[],
  ): Promise<CreditNoteLine[]> {
    return Promise.all(
      items.map(async (item) => {
        const quantity = parsePositiveDecimal(item.quantity);
        const unitPrice = parseMoney(item.unitPrice);
        const gross = roundMoney(quantity.mul(unitPrice));
        const discountPercent = parsePercent(item.discountPercent ?? '0');
        const discountAmount = roundMoney(gross.mul(discountPercent).div(100));
        const lineSubtotal = gross.minus(discountAmount);

        let taxCode: string | null = null;
        let taxCodeName: string | null = null;
        let taxComponents: CreditNoteLineTaxComponent[] = [];
        let taxAmount = new Prisma.Decimal(0);

        if (item.taxCodeId) {
          const taxCodeResponse = await this.accountingTaxCodes.getById(
            actor,
            item.taxCodeId,
          );
          taxCode = taxCodeResponse.code;
          taxCodeName = taxCodeResponse.name;
          taxComponents = taxCodeResponse.components.map((component) => {
            const rate = new Prisma.Decimal(component.rate);
            const componentTaxAmount = roundMoney(lineSubtotal.mul(rate).div(100));
            return {
              sequence: component.sequence,
              type: component.type,
              name: component.name,
              rate,
              componentTaxAmount,
            };
          });
          taxAmount = taxComponents.reduce(
            (sum, component) => sum.plus(component.componentTaxAmount),
            new Prisma.Decimal(0),
          );
        }

        const lineTotal = lineSubtotal.plus(taxAmount);

        return {
          description: item.description.trim(),
          quantity,
          unitPrice,
          gross,
          discountPercent,
          discountAmount,
          taxCodeId: item.taxCodeId ?? null,
          taxCode,
          taxCodeName,
          taxAmount,
          lineSubtotal,
          lineTotal,
          taxComponents,
        };
      }),
    );
  }

  private toItemCreateData(tenantId: string, line: CreditNoteLine) {
    return {
      tenantId,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountPercent: line.discountPercent,
      discountAmount: line.discountAmount,
      taxCodeId: line.taxCodeId,
      taxCode: line.taxCode,
      taxCodeName: line.taxCodeName,
      taxAmount: line.taxAmount,
      lineSubtotal: line.lineSubtotal,
      lineTotal: line.lineTotal,
      taxComponents: {
        create: line.taxComponents.map((component) => ({
          tenantId,
          sequence: component.sequence,
          type: component.type,
          name: component.name,
          rate: component.rate,
          componentTaxAmount: component.componentTaxAmount,
        })),
      },
    };
  }

  private sumTotals(lines: CreditNoteLine[]): {
    subtotal: Prisma.Decimal;
    discountTotal: Prisma.Decimal;
    taxTotal: Prisma.Decimal;
    total: Prisma.Decimal;
  } {
    const subtotal = lines.reduce((sum, line) => sum.plus(line.gross), new Prisma.Decimal(0));
    const discountTotal = lines.reduce(
      (sum, line) => sum.plus(line.discountAmount),
      new Prisma.Decimal(0),
    );
    const taxTotal = lines.reduce((sum, line) => sum.plus(line.taxAmount), new Prisma.Decimal(0));
    const total = subtotal.minus(discountTotal).plus(taxTotal);
    return { subtotal, discountTotal, taxTotal, total };
  }

  private async nextCreditNoteNumber(tenantId: string): Promise<string> {
    const count = await this.prisma.salesCreditNote.count({ where: { tenantId } });
    return `SCN-${String(count + 1).padStart(8, '0')}`;
  }

  /**
   * Mirrors SalesInvoicesService's own postings, reversed — the exact same
   * shape as SalesReturnsService.buildReturnPostingRequest()'s commercial-
   * only case (a return with no shipment-linked lines):
   *   Dr SALES_REVENUE       subtotal
   *   Cr SALES_DISCOUNT      discountTotal, when > 0
   *   Dr OUTPUT_TAX          taxTotal, when > 0
   *   Cr ACCOUNTS_RECEIVABLE total
   * Always balances by construction: total = subtotal - discountTotal +
   * taxTotal, so Dr(subtotal + taxTotal) == Cr(discountTotal + total).
   * Reuses the existing SALES_REVENUE/SALES_DISCOUNT/OUTPUT_TAX/
   * ACCOUNTS_RECEIVABLE roles — no new account-mapping purpose.
   */
  private buildCreditNotePostingRequest(
    creditNote: CreditNoteWithItems,
  ): CreateJournalPostingRequest {
    const lines: CreateJournalPostingRequest['lines'] = [
      {
        role: 'SALES_REVENUE',
        side: 'DEBIT',
        amount: moneyToString(creditNote.subtotal),
      },
    ];
    if (creditNote.discountTotal.gt(0)) {
      lines.push({
        role: 'SALES_DISCOUNT',
        side: 'CREDIT',
        amount: moneyToString(creditNote.discountTotal),
      });
    }
    if (creditNote.taxTotal.gt(0)) {
      lines.push({
        role: 'OUTPUT_TAX',
        side: 'DEBIT',
        amount: moneyToString(creditNote.taxTotal),
      });
    }
    lines.push({
      role: 'ACCOUNTS_RECEIVABLE',
      side: 'CREDIT',
      amount: moneyToString(creditNote.total),
    });

    return {
      sourceService: ACCOUNTING_SOURCE_SERVICE,
      sourceType: 'SALES_CREDIT_NOTE',
      sourceId: creditNote.id,
      description: `${creditNote.creditNoteNumber} — ${creditNote.customerName}`,
      lines,
    };
  }

  /**
   * Attempts to post (or idempotently replay) this credit note's accounting
   * journal and persists the outcome as a Sales-side cache — never throws:
   * the caller decides whether a failure should be surfaced. Mirrors
   * PurchaseDebitNotesService.attemptDebitNotePosting() exactly.
   */
  private async attemptCreditNotePosting(
    actor: ActorContext,
    creditNote: CreditNoteWithItems,
    request?: RequestAuditMeta,
  ) {
    try {
      const result = await this.accountingJournal.post(
        actor,
        this.buildCreditNotePostingRequest(creditNote),
      );
      const updated = await this.prisma.salesCreditNote.update({
        where: { id: creditNote.id },
        data: {
          accountingPostingStatus: SalesCreditNotePostingStatus.POSTED,
          journalEntryId: result.id,
        },
        include: CREDIT_NOTE_INCLUDE,
      });
      await this.audit.record({
        actor,
        action: 'sales-credit-note.accounting-posted',
        resource: 'sales-credit-note',
        resourceId: creditNote.id,
        metadata: { journalEntryId: result.id, idempotentReplay: result.idempotentReplay },
        request,
      });
      return { creditNote: updated, error: undefined as unknown };
    } catch (error) {
      this.logger.error(
        `Failed to post accounting journal for sales credit note ${creditNote.id}`,
        error instanceof Error ? error.stack : undefined,
      );
      try {
        await this.prisma.salesCreditNote.update({
          where: { id: creditNote.id },
          data: { accountingPostingStatus: SalesCreditNotePostingStatus.FAILED },
        });
      } catch (updateError) {
        this.logger.error(
          `Failed to record FAILED accounting posting status for sales credit note ${creditNote.id}`,
          updateError instanceof Error ? updateError.stack : undefined,
        );
      }
      const refreshed = await this.require(actor, creditNote.id);
      return { creditNote: refreshed, error };
    }
  }

  /**
   * Attempts to reverse (or idempotently replay the reversal of) this
   * credit note's already-POSTED accounting journal. The original journal
   * entry is never touched — looked up read-only inside accounting-service
   * and stays POSTED permanently (no VOID). On failure,
   * accountingPostingStatus is deliberately left at POSTED so the existing
   * retryAccountingReversal() path can recover it. Mirrors
   * PurchaseDebitNotesService.attemptDebitNoteReversal() exactly.
   */
  private async attemptCreditNoteReversal(
    actor: ActorContext,
    creditNote: CreditNoteWithItems,
    request?: RequestAuditMeta,
  ) {
    try {
      const result = await this.accountingJournal.reverse(actor, {
        sourceService: ACCOUNTING_SOURCE_SERVICE,
        sourceType: 'SALES_CREDIT_NOTE',
        sourceId: creditNote.id,
        reversalSourceType: 'SALES_CREDIT_NOTE_REVERSAL',
        description: `Reversal of ${creditNote.creditNoteNumber}`,
      });
      const updated = await this.prisma.salesCreditNote.update({
        where: { id: creditNote.id },
        data: {
          accountingPostingStatus: SalesCreditNotePostingStatus.REVERSED,
          reversalJournalEntryId: result.id,
        },
        include: CREDIT_NOTE_INCLUDE,
      });
      await this.audit.record({
        actor,
        action: 'sales-credit-note.accounting-reversed',
        resource: 'sales-credit-note',
        resourceId: creditNote.id,
        metadata: {
          reversalJournalEntryId: result.id,
          idempotentReplay: result.idempotentReplay,
        },
        request,
      });
      return { creditNote: updated, error: undefined as unknown };
    } catch (error) {
      this.logger.error(
        `Failed to reverse accounting journal for reversed sales credit note ${creditNote.id}`,
        error instanceof Error ? error.stack : undefined,
      );
      const refreshed = await this.require(actor, creditNote.id);
      return { creditNote: refreshed, error };
    }
  }
}
