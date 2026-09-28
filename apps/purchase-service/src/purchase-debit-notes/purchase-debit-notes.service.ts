import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DebitNotePostingStatus,
  DebitNoteStatus,
  Prisma,
  PurchaseInvoiceStatus,
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
  CreatePurchaseDebitNoteDto,
  CreatePurchaseDebitNoteItemDto,
} from './dto/purchase-debit-note.dto';
import { toPurchaseDebitNoteResponse } from './dto/purchase-debit-note-response';
import { ReversePurchaseDebitNoteDto } from './dto/reverse-purchase-debit-note.dto';

const ACCOUNTING_SOURCE_SERVICE = 'purchase-service';

const DEBIT_NOTE_INCLUDE = {
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      taxComponents: { orderBy: { sequence: 'asc' as const } },
    },
  },
};

type DebitNoteWithItems = Prisma.PurchaseDebitNoteGetPayload<{
  include: typeof DEBIT_NOTE_INCLUDE;
}>;

interface DebitNoteLineTaxComponent {
  sequence: number;
  type: string;
  name: string | null;
  rate: Prisma.Decimal;
  componentTaxAmount: Prisma.Decimal;
}

interface DebitNoteLine {
  description: string;
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  gross: Prisma.Decimal;
  discountPercent: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  taxCodeId: string | null;
  taxCode: string | null;
  taxCodeName: string | null;
  taxAmount: Prisma.Decimal;
  lineSubtotal: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  taxComponents: DebitNoteLineTaxComponent[];
}

/**
 * Purchase Debit Note V1 (Phase 3.13) — a standalone Accounts Payable
 * adjustment document, deliberately independent of Purchase Return/
 * GoodsReceipt. Never calls InventoryStockClient: no physical goods movement
 * is ever associated with a Debit Note. purchaseInvoiceId is optional,
 * retained only as traceability when supplied.
 *
 * Document-level lifecycle: DRAFT -> POSTED -> REVERSED, mirroring
 * PurchaseReturnsService's own confirm()/reverse() idempotency conventions
 * (already-POSTED post() and already-REVERSED reverse() are no-ops; a failed
 * accounting reversal never introduces a new "reversal failed" status).
 * Accounting posting/reversal mirror PurchaseInvoicesService/
 * PurchaseReturnsService's own post-commit, best-effort, never-throws-from-
 * the-caller's-perspective pattern.
 */
@Injectable()
export class PurchaseDebitNotesService {
  private readonly logger = new Logger(PurchaseDebitNotesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountingTaxCodes: AccountingTaxCodeClient,
    private readonly accountingJournal: AccountingJournalClient,
    private readonly audit: IdentityAuditClient,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreatePurchaseDebitNoteDto,
    request?: RequestAuditMeta,
  ) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, tenantId: actor.tenantId },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');

    let supplierBillingAddress = supplier.address;
    let invoiceId: string | null = null;
    if (dto.purchaseInvoiceId) {
      const invoice = await this.prisma.purchaseInvoice.findFirst({
        where: { id: dto.purchaseInvoiceId, tenantId: actor.tenantId },
        select: {
          id: true,
          status: true,
          supplierId: true,
          supplierBillingAddress: true,
        },
      });
      if (!invoice) throw new NotFoundException('Purchase invoice not found');
      if (invoice.supplierId !== supplier.id) {
        throw new BadRequestException(
          'Purchase invoice does not belong to the selected supplier',
        );
      }
      if (invoice.status !== PurchaseInvoiceStatus.CONFIRMED) {
        throw new ConflictException(
          'Referenced purchase invoice must be CONFIRMED',
        );
      }
      invoiceId = invoice.id;
      supplierBillingAddress = invoice.supplierBillingAddress ?? supplierBillingAddress;
    }

    const lines = await this.resolveLines(actor, dto.items);
    const totals = this.sumTotals(lines);
    if (totals.total.lte(0)) {
      throw new BadRequestException(
        'Purchase debit note total must be greater than zero',
      );
    }
    const debitNoteDate = dto.debitNoteDate ? new Date(dto.debitNoteDate) : new Date();

    for (let attempt = 0; attempt < 5; attempt++) {
      const debitNoteNumber = await this.nextDebitNoteNumber(actor.tenantId);
      try {
        const row = await this.prisma.purchaseDebitNote.create({
          data: {
            tenantId: actor.tenantId,
            debitNoteNumber,
            supplierId: supplier.id,
            supplierName: supplier.name,
            supplierGstin: supplier.gstin,
            supplierBillingAddress,
            purchaseInvoiceId: invoiceId,
            debitNoteDate,
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
          include: DEBIT_NOTE_INCLUDE,
        });
        await this.audit.record({
          actor,
          action: 'purchase-debit-note.created',
          resource: 'purchase-debit-note',
          resourceId: row.id,
          metadata: {
            debitNoteNumber: row.debitNoteNumber,
            supplierId: row.supplierId,
            purchaseInvoiceId: row.purchaseInvoiceId,
            total: moneyToString(row.total),
          },
          request,
        });
        return toPurchaseDebitNoteResponse(row);
      } catch (error) {
        if (isUniqueConstraintError(error) && attempt < 4) {
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException('Could not allocate purchase debit note number');
  }

  async list(actor: ActorContext) {
    const rows = await this.prisma.purchaseDebitNote.findMany({
      where: { tenantId: actor.tenantId },
      include: DEBIT_NOTE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return { items: rows.map(toPurchaseDebitNoteResponse) };
  }

  async getById(actor: ActorContext, id: string) {
    return toPurchaseDebitNoteResponse(await this.require(actor, id));
  }

  /**
   * DRAFT -> POSTED. Idempotent: re-invoking on an already-POSTED debit note
   * is a no-op that never re-attempts the accounting posting (mirrors
   * PurchaseReturnsService.confirm()). REVERSED is a hard conflict — a
   * reversed document can never be re-posted.
   */
  async post(actor: ActorContext, id: string, request?: RequestAuditMeta) {
    const existing = await this.require(actor, id);
    if (existing.status === DebitNoteStatus.POSTED) {
      return toPurchaseDebitNoteResponse(existing);
    }
    if (existing.status !== DebitNoteStatus.DRAFT) {
      throw new ConflictException('Only a DRAFT purchase debit note can be posted');
    }

    const posted = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>(
        Prisma.sql`
          SELECT id, status::text AS status
          FROM purchase_debit_notes
          WHERE id = ${id}::uuid AND "tenantId" = ${actor.tenantId}::uuid
          FOR UPDATE
        `,
      );
      const locked = rows[0];
      if (!locked) throw new NotFoundException('Purchase debit note not found');
      if (locked.status === DebitNoteStatus.POSTED) {
        return tx.purchaseDebitNote.findFirstOrThrow({
          where: { id, tenantId: actor.tenantId },
          include: DEBIT_NOTE_INCLUDE,
        });
      }
      if (locked.status !== DebitNoteStatus.DRAFT) {
        throw new ConflictException('Only a DRAFT purchase debit note can be posted');
      }
      return tx.purchaseDebitNote.update({
        where: { id },
        data: {
          status: DebitNoteStatus.POSTED,
          postedAt: new Date(),
          postedBy: actor.userId,
        },
        include: DEBIT_NOTE_INCLUDE,
      });
    });

    await this.audit.record({
      actor,
      action: 'purchase-debit-note.posted',
      resource: 'purchase-debit-note',
      resourceId: posted.id,
      metadata: { total: moneyToString(posted.total) },
      request,
    });

    const { debitNote: finalRow } = await this.attemptDebitNotePosting(
      actor,
      posted,
      request,
    );
    return toPurchaseDebitNoteResponse(finalRow);
  }

  /**
   * Manual retry for a POSTED debit note whose accounting posting is
   * currently FAILED (or never attempted). Mirrors
   * PurchaseReturnsService.retryAccountingPosting() exactly: a failure here
   * IS surfaced to the caller, unlike post()'s post-commit best-effort call.
   */
  async retryAccountingPosting(
    actor: ActorContext,
    id: string,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.require(actor, id);
    if (existing.status !== DebitNoteStatus.POSTED) {
      throw new ConflictException(
        'Only a POSTED purchase debit note can have its accounting posting retried',
      );
    }
    if (existing.accountingPostingStatus === DebitNotePostingStatus.POSTED) {
      return toPurchaseDebitNoteResponse(existing);
    }

    const { debitNote, error } = await this.attemptDebitNotePosting(
      actor,
      existing,
      request,
    );
    if (error) throw error;

    await this.audit.record({
      actor,
      action: 'purchase-debit-note.accounting-posting-retried',
      resource: 'purchase-debit-note',
      resourceId: debitNote.id,
      metadata: { journalEntryId: debitNote.journalEntryId },
      request,
    });

    return toPurchaseDebitNoteResponse(debitNote);
  }

  /**
   * POSTED -> REVERSED. Never deletes the document, never VOIDs the
   * original journal (that stays POSTED permanently — a separate accounting
   * reversal journal is created instead). Idempotent: re-invoking on an
   * already-REVERSED debit note is a no-op that never re-calls
   * accounting-service. DRAFT cannot be reversed. Mirrors
   * PurchaseReturnsService.reverse() / PurchaseInvoicesService.reversePayment()
   * exactly.
   */
  async reverse(
    actor: ActorContext,
    id: string,
    dto: ReversePurchaseDebitNoteDto,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.require(actor, id);
    if (existing.status === DebitNoteStatus.REVERSED) {
      return toPurchaseDebitNoteResponse(existing);
    }
    if (existing.status !== DebitNoteStatus.POSTED) {
      throw new ConflictException('Only a POSTED purchase debit note can be reversed');
    }

    const reversed = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>(
        Prisma.sql`
          SELECT id, status::text AS status
          FROM purchase_debit_notes
          WHERE id = ${id}::uuid AND "tenantId" = ${actor.tenantId}::uuid
          FOR UPDATE
        `,
      );
      const locked = rows[0];
      if (!locked) throw new NotFoundException('Purchase debit note not found');
      if (locked.status === DebitNoteStatus.REVERSED) {
        return tx.purchaseDebitNote.findFirstOrThrow({
          where: { id, tenantId: actor.tenantId },
          include: DEBIT_NOTE_INCLUDE,
        });
      }
      if (locked.status !== DebitNoteStatus.POSTED) {
        throw new ConflictException('Only a POSTED purchase debit note can be reversed');
      }
      return tx.purchaseDebitNote.update({
        where: { id },
        data: {
          status: DebitNoteStatus.REVERSED,
          reversedAt: new Date(),
          reversedBy: actor.userId,
          reversalReason: dto.reason?.trim() || null,
        },
        include: DEBIT_NOTE_INCLUDE,
      });
    });

    await this.audit.record({
      actor,
      action: 'purchase-debit-note.reversed',
      resource: 'purchase-debit-note',
      resourceId: reversed.id,
      metadata: { reason: dto.reason?.trim() || null },
      request,
    });

    let finalRow = reversed;
    if (
      reversed.accountingPostingStatus === DebitNotePostingStatus.POSTED &&
      reversed.journalEntryId
    ) {
      const { debitNote: withReversal } = await this.attemptDebitNoteReversal(
        actor,
        reversed,
        request,
      );
      finalRow = withReversal;
    }

    return toPurchaseDebitNoteResponse(finalRow);
  }

  /**
   * Manual retry for a REVERSED debit note whose accounting reversal
   * (attempted post-commit inside reverse()) failed. Mirrors
   * PurchaseReturnsService.retryAccountingReversal() exactly.
   */
  async retryAccountingReversal(
    actor: ActorContext,
    id: string,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.require(actor, id);
    if (existing.status !== DebitNoteStatus.REVERSED) {
      throw new ConflictException(
        'Only a REVERSED purchase debit note can have its accounting reversal retried',
      );
    }
    if (existing.accountingPostingStatus === DebitNotePostingStatus.REVERSED) {
      return toPurchaseDebitNoteResponse(existing);
    }
    if (
      existing.accountingPostingStatus !== DebitNotePostingStatus.POSTED ||
      !existing.journalEntryId
    ) {
      throw new ConflictException(
        'This purchase debit note has no posted accounting journal to reverse',
      );
    }

    const { debitNote, error } = await this.attemptDebitNoteReversal(
      actor,
      existing,
      request,
    );
    if (error) throw error;

    await this.audit.record({
      actor,
      action: 'purchase-debit-note.accounting-reversal-retried',
      resource: 'purchase-debit-note',
      resourceId: debitNote.id,
      metadata: { reversalJournalEntryId: debitNote.reversalJournalEntryId },
      request,
    });

    return toPurchaseDebitNoteResponse(debitNote);
  }

  private async require(actor: ActorContext, id: string): Promise<DebitNoteWithItems> {
    const row = await this.prisma.purchaseDebitNote.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: DEBIT_NOTE_INCLUDE,
    });
    if (!row) throw new NotFoundException('Purchase debit note not found');
    return row;
  }

  /**
   * Mirrors PurchaseOrdersService.mapLines()'s tax handling exactly (resolve
   * taxCodeId fresh via AccountingTaxCodeClient, snapshot components,
   * recompute against this line's own lineSubtotal) — there is no PO/GR line
   * to copy a tax snapshot from, unlike PurchaseInvoiceItem.
   */
  private async resolveLines(
    actor: ActorContext,
    items: CreatePurchaseDebitNoteItemDto[],
  ): Promise<DebitNoteLine[]> {
    return Promise.all(
      items.map(async (item) => {
        const quantity = parsePositiveDecimal(item.quantity);
        const unitCost = parseMoney(item.unitCost);
        const gross = roundMoney(quantity.mul(unitCost));
        const discountPercent = parsePercent(item.discountPercent ?? '0');
        const discountAmount = roundMoney(gross.mul(discountPercent).div(100));
        const lineSubtotal = gross.minus(discountAmount);

        let taxCode: string | null = null;
        let taxCodeName: string | null = null;
        let taxComponents: DebitNoteLineTaxComponent[] = [];
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
          unitCost,
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

  private toItemCreateData(tenantId: string, line: DebitNoteLine) {
    return {
      tenantId,
      description: line.description,
      quantity: line.quantity,
      unitCost: line.unitCost,
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

  private sumTotals(lines: DebitNoteLine[]): {
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

  private async nextDebitNoteNumber(tenantId: string): Promise<string> {
    const count = await this.prisma.purchaseDebitNote.count({ where: { tenantId } });
    return `PDN-${String(count + 1).padStart(8, '0')}`;
  }

  /**
   * Reverses Purchase Invoice confirm()'s own AP posting for this Debit
   * Note's own adjustment amount:
   *   Dr ACCOUNTS_PAYABLE   total
   *   Cr PURCHASE_EXPENSE   subtotal - discountTotal
   *   Cr INPUT_TAX          taxTotal, when > 0
   * Always balances (Dr total == Cr expensePortion + Cr taxTotal by
   * construction: total = subtotal - discountTotal + taxTotal). Reuses the
   * existing PURCHASE_EXPENSE/ACCOUNTS_PAYABLE/INPUT_TAX roles — no new
   * account-mapping purpose.
   */
  private buildDebitNotePostingRequest(
    debitNote: DebitNoteWithItems,
  ): CreateJournalPostingRequest {
    const expensePortion = debitNote.subtotal.minus(debitNote.discountTotal);
    const lines: CreateJournalPostingRequest['lines'] = [
      {
        role: 'ACCOUNTS_PAYABLE',
        side: 'DEBIT',
        amount: moneyToString(debitNote.total),
      },
    ];
    if (expensePortion.gt(0)) {
      lines.push({
        role: 'PURCHASE_EXPENSE',
        side: 'CREDIT',
        amount: moneyToString(expensePortion),
      });
    }
    if (debitNote.taxTotal.gt(0)) {
      lines.push({
        role: 'INPUT_TAX',
        side: 'CREDIT',
        amount: moneyToString(debitNote.taxTotal),
      });
    }

    return {
      sourceService: ACCOUNTING_SOURCE_SERVICE,
      sourceType: 'PURCHASE_DEBIT_NOTE',
      sourceId: debitNote.id,
      description: `${debitNote.debitNoteNumber} — ${debitNote.supplierName}`,
      lines,
    };
  }

  /**
   * Attempts to post (or idempotently replay) this debit note's accounting
   * journal and persists the outcome as a Purchase-side cache — never
   * throws: the caller decides whether a failure should be surfaced.
   * Mirrors PurchaseReturnsService.attemptReturnPosting() exactly.
   */
  private async attemptDebitNotePosting(
    actor: ActorContext,
    debitNote: DebitNoteWithItems,
    request?: RequestAuditMeta,
  ) {
    try {
      const result = await this.accountingJournal.post(
        actor,
        this.buildDebitNotePostingRequest(debitNote),
      );
      const updated = await this.prisma.purchaseDebitNote.update({
        where: { id: debitNote.id },
        data: {
          accountingPostingStatus: DebitNotePostingStatus.POSTED,
          journalEntryId: result.id,
        },
        include: DEBIT_NOTE_INCLUDE,
      });
      await this.audit.record({
        actor,
        action: 'purchase-debit-note.accounting-posted',
        resource: 'purchase-debit-note',
        resourceId: debitNote.id,
        metadata: { journalEntryId: result.id, idempotentReplay: result.idempotentReplay },
        request,
      });
      return { debitNote: updated, error: undefined as unknown };
    } catch (error) {
      this.logger.error(
        `Failed to post accounting journal for purchase debit note ${debitNote.id}`,
        error instanceof Error ? error.stack : undefined,
      );
      try {
        await this.prisma.purchaseDebitNote.update({
          where: { id: debitNote.id },
          data: { accountingPostingStatus: DebitNotePostingStatus.FAILED },
        });
      } catch (updateError) {
        this.logger.error(
          `Failed to record FAILED accounting posting status for purchase debit note ${debitNote.id}`,
          updateError instanceof Error ? updateError.stack : undefined,
        );
      }
      const refreshed = await this.require(actor, debitNote.id);
      return { debitNote: refreshed, error };
    }
  }

  /**
   * Attempts to reverse (or idempotently replay the reversal of) this debit
   * note's already-POSTED accounting journal. The original journal entry is
   * never touched — looked up read-only inside accounting-service and stays
   * POSTED permanently (no VOID). On failure, accountingPostingStatus is
   * deliberately left at POSTED so the existing retryAccountingReversal()
   * path can recover it. Mirrors PurchaseReturnsService.attemptReturnReversal()
   * exactly.
   */
  private async attemptDebitNoteReversal(
    actor: ActorContext,
    debitNote: DebitNoteWithItems,
    request?: RequestAuditMeta,
  ) {
    try {
      const result = await this.accountingJournal.reverse(actor, {
        sourceService: ACCOUNTING_SOURCE_SERVICE,
        sourceType: 'PURCHASE_DEBIT_NOTE',
        sourceId: debitNote.id,
        reversalSourceType: 'PURCHASE_DEBIT_NOTE_REVERSAL',
        description: `Reversal of ${debitNote.debitNoteNumber}`,
      });
      const updated = await this.prisma.purchaseDebitNote.update({
        where: { id: debitNote.id },
        data: {
          accountingPostingStatus: DebitNotePostingStatus.REVERSED,
          reversalJournalEntryId: result.id,
        },
        include: DEBIT_NOTE_INCLUDE,
      });
      await this.audit.record({
        actor,
        action: 'purchase-debit-note.accounting-reversed',
        resource: 'purchase-debit-note',
        resourceId: debitNote.id,
        metadata: {
          reversalJournalEntryId: result.id,
          idempotentReplay: result.idempotentReplay,
        },
        request,
      });
      return { debitNote: updated, error: undefined as unknown };
    } catch (error) {
      this.logger.error(
        `Failed to reverse accounting journal for reversed purchase debit note ${debitNote.id}`,
        error instanceof Error ? error.stack : undefined,
      );
      const refreshed = await this.require(actor, debitNote.id);
      return { debitNote: refreshed, error };
    }
  }
}
