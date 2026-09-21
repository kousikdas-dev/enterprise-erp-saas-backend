import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  PurchaseInvoicePaymentStatus,
  PurchaseInvoicePostingStatus,
  PurchaseInvoiceStatus,
  PurchaseOrderStatus,
  SupplierPaymentPostingStatus,
} from '../../generated/prisma-client';
import {
  AccountingJournalClient,
  CreateJournalPostingRequest,
} from '../accounting/accounting-journal.client';
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
  MismatchSourcePoItem,
  toPurchaseInvoiceResponse,
} from './dto/purchase-invoice-response';
import {
  CreatePurchaseInvoiceDto,
  CreatePurchaseInvoiceItemDto,
  CreateSupplierPaymentDto,
  UpdatePurchaseInvoiceDto,
} from './dto/purchase-invoice.dto';
import { toSupplierPaymentResponse } from './dto/supplier-payment-response';

const INVOICE_INCLUDE = {
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: { taxComponents: { orderBy: { sequence: 'asc' as const } } },
  },
};

interface PoItemTaxComponentRow {
  sequence: number;
  type: string;
  name: string | null;
  rate: Prisma.Decimal;
}

interface PoItemQuantityRow {
  id: string;
  tenantId: string;
  quantity: Prisma.Decimal;
  receivedQuantity: Prisma.Decimal;
  invoicedQuantity: Prisma.Decimal;
}

interface PoItemRow extends PoItemQuantityRow {
  productId: string;
  productSku: string;
  productName: string;
  unitOfMeasureId: string | null;
  uomCode: string | null;
  uomName: string | null;
  conversionFactor: Prisma.Decimal | null;
  taxCodeId: string | null;
  taxCode: string | null;
  taxCodeName: string | null;
  taxComponents: PoItemTaxComponentRow[];
}

interface GrItemRow {
  id: string;
  tenantId: string;
  purchaseOrderItemId: string;
  productId: string;
  productSku: string;
  productName: string;
  unitOfMeasureId: string | null;
  uomCode: string | null;
  uomName: string | null;
  conversionFactor: Prisma.Decimal | null;
  goodsReceipt: { purchaseOrderId: string };
}

interface PurchaseInvoiceLineTaxComponent {
  sequence: number;
  type: string;
  name: string | null;
  rate: Prisma.Decimal;
  componentTaxAmount: Prisma.Decimal;
}

interface PurchaseInvoiceLine {
  purchaseOrderItemId: string;
  goodsReceiptItemId: string | null;
  productId: string;
  productSku: string;
  productName: string;
  unitOfMeasureId: string | null;
  uomCode: string | null;
  uomName: string | null;
  conversionFactor: Prisma.Decimal | null;
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
  taxComponents: PurchaseInvoiceLineTaxComponent[];
}

const RECEIVABLE_PO_STATUSES: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.CONFIRMED,
  PurchaseOrderStatus.PARTIALLY_RECEIVED,
  PurchaseOrderStatus.RECEIVED,
];

const ACCOUNTING_SOURCE_SERVICE = 'purchase-service';

/** Minimal shape needed to build a Purchase Invoice's accounting posting request. */
interface InvoicePostingSource {
  id: string;
  invoiceNumber: string;
  supplierName: string;
  subtotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  taxTotal: Prisma.Decimal;
  total: Prisma.Decimal;
}

/** Minimal shape needed to build a Supplier Payment's accounting posting request. */
interface PaymentPostingSource {
  id: string;
  amount: Prisma.Decimal;
  paymentMethodId: string | null;
}

@Injectable()
export class PurchaseInvoicesService {
  private readonly logger = new Logger(PurchaseInvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: IdentityAuditClient,
    private readonly accountingJournal: AccountingJournalClient,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreatePurchaseInvoiceDto,
    request?: RequestAuditMeta,
  ) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id: dto.purchaseOrderId, tenantId: actor.tenantId },
      include: {
        items: { include: { taxComponents: { orderBy: { sequence: 'asc' } } } },
      },
    });
    if (!order) throw new NotFoundException('Purchase order not found');
    if (!RECEIVABLE_PO_STATUSES.includes(order.status)) {
      throw new ConflictException('Purchase order is not open for invoicing');
    }

    const lines = await this.resolveLines(actor, order.id, order.items, dto.items);
    const poItemsById = new Map(order.items.map((item) => [item.id, item]));
    // Soft/advisory check — no lock. The authoritative, race-proof check
    // happens at confirm() time under the FOR UPDATE lock (see confirm()).
    await this.assertAvailableQuantity(
      this.prisma,
      actor,
      order.id,
      poItemsById,
      lines,
      null,
    );

    const totals = this.sumTotals(lines);
    const invoiceDate = dto.invoiceDate ? new Date(dto.invoiceDate) : new Date();
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;

    for (let attempt = 0; attempt < 5; attempt++) {
      const invoiceNumber = await this.nextInvoiceNumber(actor.tenantId);
      try {
        const row = await this.prisma.purchaseInvoice.create({
          data: {
            tenantId: actor.tenantId,
            invoiceNumber,
            supplierInvoiceNumber: dto.supplierInvoiceNumber?.trim() || null,
            purchaseOrderId: order.id,
            status: PurchaseInvoiceStatus.DRAFT,
            // Supplier snapshot copied from the PurchaseOrder's own
            // already-frozen header snapshot — never live Supplier.
            supplierId: order.supplierId,
            supplierName: order.supplierName,
            supplierGstin: order.supplierGstin,
            supplierBillingAddress: order.supplierBillingAddress,
            paymentTermId: order.paymentTermId,
            invoiceDate,
            dueDate,
            notes: dto.notes?.trim() || null,
            subtotal: totals.subtotal,
            discountTotal: totals.discountTotal,
            taxTotal: totals.taxTotal,
            total: totals.total,
            items: {
              create: lines.map((line) => this.toItemCreateData(actor.tenantId, line)),
            },
          },
          include: INVOICE_INCLUDE,
        });
        await this.audit.record({
          actor,
          action: 'purchase-invoice.created',
          resource: 'purchase-invoice',
          resourceId: row.id,
          metadata: {
            invoiceNumber: row.invoiceNumber,
            purchaseOrderId: row.purchaseOrderId,
            itemCount: row.items.length,
          },
          request,
        });
        return this.toResponse(actor, row);
      } catch (error) {
        if (isUniqueConstraintError(error) && attempt < 4) {
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException('Could not allocate purchase invoice number');
  }

  async list(actor: ActorContext) {
    const rows = await this.prisma.purchaseInvoice.findMany({
      where: { tenantId: actor.tenantId },
      include: INVOICE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return { items: await this.toResponses(actor, rows) };
  }

  async getById(actor: ActorContext, id: string) {
    return this.toResponse(actor, await this.require(actor, id));
  }

  async update(
    actor: ActorContext,
    id: string,
    dto: UpdatePurchaseInvoiceDto,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.require(actor, id);
    if (existing.status !== PurchaseInvoiceStatus.DRAFT) {
      throw new ConflictException('Only DRAFT purchase invoices can be updated');
    }
    if (
      dto.supplierInvoiceNumber === undefined &&
      dto.invoiceDate === undefined &&
      dto.dueDate === undefined &&
      dto.notes === undefined &&
      dto.items === undefined
    ) {
      throw new BadRequestException('No fields to update');
    }

    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id: existing.purchaseOrderId, tenantId: actor.tenantId },
      include: {
        items: { include: { taxComponents: { orderBy: { sequence: 'asc' } } } },
      },
    });
    if (!order) throw new NotFoundException('Purchase order not found');

    const lines = dto.items
      ? await this.resolveLines(actor, order.id, order.items, dto.items)
      : null;
    if (lines) {
      const poItemsById = new Map(order.items.map((item) => [item.id, item]));
      // excludeInvoiceId: this invoice's own prior DRAFT lines must not be
      // double-counted against the new line set being validated here.
      await this.assertAvailableQuantity(
        this.prisma,
        actor,
        order.id,
        poItemsById,
        lines,
        existing.id,
      );
    }

    const headerData = {
      supplierInvoiceNumber:
        dto.supplierInvoiceNumber === undefined
          ? undefined
          : dto.supplierInvoiceNumber?.trim() || null,
      invoiceDate:
        dto.invoiceDate === undefined ? undefined : new Date(dto.invoiceDate),
      dueDate:
        dto.dueDate === undefined
          ? undefined
          : dto.dueDate
            ? new Date(dto.dueDate)
            : null,
      notes: dto.notes === undefined ? undefined : dto.notes?.trim() || null,
    };

    const row = await this.prisma.$transaction(async (tx) => {
      if (lines) {
        const totals = this.sumTotals(lines);
        await tx.purchaseInvoiceItem.deleteMany({
          where: { purchaseInvoiceId: id, tenantId: actor.tenantId },
        });
        for (const line of lines) {
          await tx.purchaseInvoiceItem.create({
            data: {
              purchaseInvoiceId: id,
              ...this.toItemCreateData(actor.tenantId, line),
            },
          });
        }
        return tx.purchaseInvoice.update({
          where: { id },
          data: {
            ...headerData,
            subtotal: totals.subtotal,
            discountTotal: totals.discountTotal,
            taxTotal: totals.taxTotal,
            total: totals.total,
          },
          include: INVOICE_INCLUDE,
        });
      }
      return tx.purchaseInvoice.update({
        where: { id },
        data: headerData,
        include: INVOICE_INCLUDE,
      });
    });

    await this.audit.record({
      actor,
      action: 'purchase-invoice.updated',
      resource: 'purchase-invoice',
      resourceId: row.id,
      metadata: { itemCount: row.items.length, total: moneyToString(row.total) },
      request,
    });
    return this.toResponse(actor, row);
  }

  /**
   * DRAFT -> CONFIRMED. Locks purchase_invoices -> purchase_orders ->
   * purchase_order_items (in that order), re-validates the aggregate
   * quantity bound under lock (accounting for other still-active DRAFT
   * invoices, not just the already-committed invoicedQuantity — the
   * approved correction that closes the two-concurrent-DRAFT-confirms
   * race), then commits invoicedQuantity in one update per affected PO
   * item (aggregated across this invoice's own lines first).
   */
  async confirm(
    actor: ActorContext,
    id: string,
    request?: RequestAuditMeta,
  ) {
    const posted = await this.prisma.$transaction(async (tx) => {
      const invoiceRows = await tx.$queryRaw<
        Array<{ id: string; status: string; purchaseOrderId: string }>
      >(
        Prisma.sql`
          SELECT id, status::text AS status, "purchaseOrderId"
          FROM purchase_invoices
          WHERE id = ${id}::uuid AND "tenantId" = ${actor.tenantId}::uuid
          FOR UPDATE
        `,
      );
      const locked = invoiceRows[0];
      if (!locked) throw new NotFoundException('Purchase invoice not found');
      if (locked.status !== PurchaseInvoiceStatus.DRAFT) {
        throw new ConflictException(
          'Only DRAFT purchase invoices can be confirmed',
        );
      }

      await tx.$queryRaw`
        SELECT id FROM purchase_orders
        WHERE id = ${locked.purchaseOrderId}::uuid AND "tenantId" = ${actor.tenantId}::uuid
        FOR UPDATE
      `;
      await tx.$queryRaw`
        SELECT id FROM purchase_order_items
        WHERE "purchaseOrderId" = ${locked.purchaseOrderId}::uuid
          AND "tenantId" = ${actor.tenantId}::uuid
        FOR UPDATE
      `;

      const invoice = await tx.purchaseInvoice.findFirstOrThrow({
        where: { id, tenantId: actor.tenantId },
        include: INVOICE_INCLUDE,
      });
      if (invoice.items.length === 0) {
        throw new BadRequestException('Purchase invoice has no items');
      }

      const poItems = await tx.purchaseOrderItem.findMany({
        where: {
          purchaseOrderId: locked.purchaseOrderId,
          tenantId: actor.tenantId,
        },
      });
      const poItemsById = new Map(poItems.map((item) => [item.id, item]));

      // Hard, authoritative, lock-protected check — includes other still-
      // DRAFT invoices' quantities, not just the committed invoicedQuantity.
      await this.assertAvailableQuantity(
        tx,
        actor,
        locked.purchaseOrderId,
        poItemsById,
        invoice.items.map((item) => ({
          purchaseOrderItemId: item.purchaseOrderItemId,
          quantity: item.quantity,
        })),
        invoice.id,
      );

      // Aggregate this invoice's own lines by purchaseOrderItemId before
      // writing — one line's worth is never applied in isolation when the
      // same PO item is billed across multiple lines (Decision B).
      const totalByPoItem = new Map<string, Prisma.Decimal>();
      for (const item of invoice.items) {
        const current =
          totalByPoItem.get(item.purchaseOrderItemId) ?? new Prisma.Decimal(0);
        totalByPoItem.set(item.purchaseOrderItemId, current.plus(item.quantity));
      }
      for (const [poItemId, totalQty] of totalByPoItem) {
        const poItem = poItemsById.get(poItemId);
        if (!poItem) throw new ConflictException('Purchase order item missing');
        await tx.purchaseOrderItem.update({
          where: { id: poItemId },
          data: { invoicedQuantity: poItem.invoicedQuantity.plus(totalQty) },
        });
      }

      return tx.purchaseInvoice.update({
        where: { id },
        data: {
          status: PurchaseInvoiceStatus.CONFIRMED,
          confirmedAt: new Date(),
        },
        include: INVOICE_INCLUDE,
      });
    });

    await this.audit.record({
      actor,
      action: 'purchase-invoice.confirmed',
      resource: 'purchase-invoice',
      resourceId: posted.id,
      metadata: {
        purchaseOrderId: posted.purchaseOrderId,
        itemCount: posted.items.length,
        total: moneyToString(posted.total),
      },
      request,
    });

    // Post-commit, best-effort (Phase C1/C2): accounting-service is a
    // separate database, so this is never attempted inside the transaction
    // above. A failure here never fails confirm() itself — the invoice is
    // already, correctly, CONFIRMED regardless of accounting's availability;
    // only accountingPostingStatus reflects the outcome, retryable via
    // retryAccountingPosting().
    const { invoice: finalRow } = await this.attemptInvoicePosting(actor, posted, request);
    return this.toResponse(actor, finalRow);
  }

  /**
   * DRAFT -> CANCELLED: nothing to reverse (invoicedQuantity was never
   * touched by a DRAFT invoice), so no purchase_orders/purchase_order_items
   * query is issued at all.
   *
   * CONFIRMED -> CANCELLED: locks purchase_invoices -> purchase_orders ->
   * purchase_order_items (same order as confirm(), so the two can never
   * deadlock against each other), aggregates this invoice's own lines by
   * purchaseOrderItemId FIRST, then reverses invoicedQuantity with exactly
   * one update per affected PO item — never a per-line decrement against a
   * value that would go stale across multiple lines of the same PO item.
   */
  async cancel(actor: ActorContext, id: string, request?: RequestAuditMeta) {
    const { invoice: posted, previousStatus } = await this.prisma.$transaction(
      async (tx) => {
        const lockRows = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`
            SELECT id FROM purchase_invoices
            WHERE id = ${id}::uuid AND "tenantId" = ${actor.tenantId}::uuid
            FOR UPDATE
          `,
        );
        if (!lockRows[0]) throw new NotFoundException('Purchase invoice not found');

        const existing = await tx.purchaseInvoice.findFirstOrThrow({
          where: { id, tenantId: actor.tenantId },
          include: INVOICE_INCLUDE,
        });

        if (
          existing.status !== PurchaseInvoiceStatus.DRAFT &&
          existing.status !== PurchaseInvoiceStatus.CONFIRMED
        ) {
          throw new ConflictException(
            'Only DRAFT or CONFIRMED purchase invoices can be cancelled',
          );
        }
        if (existing.amountPaid.gt(0)) {
          throw new ConflictException(
            'Cannot cancel a purchase invoice that has recorded payments',
          );
        }

        if (existing.status === PurchaseInvoiceStatus.CONFIRMED) {
          await tx.$queryRaw`
            SELECT id FROM purchase_orders
            WHERE id = ${existing.purchaseOrderId}::uuid AND "tenantId" = ${actor.tenantId}::uuid
            FOR UPDATE
          `;
          await tx.$queryRaw`
            SELECT id FROM purchase_order_items
            WHERE "purchaseOrderId" = ${existing.purchaseOrderId}::uuid
              AND "tenantId" = ${actor.tenantId}::uuid
            FOR UPDATE
          `;

          const poItems = await tx.purchaseOrderItem.findMany({
            where: {
              purchaseOrderId: existing.purchaseOrderId,
              tenantId: actor.tenantId,
            },
          });
          const poItemsById = new Map(poItems.map((item) => [item.id, item]));

          // Aggregate BEFORE reversing (the corrected step): sum this
          // invoice's own lines per purchaseOrderItemId first, so a PO item
          // billed across two lines (e.g. 4 + 3) reverses in one shot (7),
          // never as two independent, mutually-clobbering updates.
          const totalByPoItem = new Map<string, Prisma.Decimal>();
          for (const item of existing.items) {
            const current =
              totalByPoItem.get(item.purchaseOrderItemId) ?? new Prisma.Decimal(0);
            totalByPoItem.set(
              item.purchaseOrderItemId,
              current.plus(item.quantity),
            );
          }
          for (const [poItemId, totalQty] of totalByPoItem) {
            const poItem = poItemsById.get(poItemId);
            if (!poItem) throw new ConflictException('Purchase order item missing');
            const newInvoicedQuantity = poItem.invoicedQuantity.minus(totalQty);
            if (newInvoicedQuantity.lt(0)) {
              // Data-integrity guard — should never trigger under correct
              // operation; surfaced as an error rather than silently
              // clamped to zero, so a real bug is never hidden.
              throw new ConflictException(
                'Cancelling this invoice would drive invoicedQuantity negative for a purchase order line',
              );
            }
            await tx.purchaseOrderItem.update({
              where: { id: poItemId },
              data: { invoicedQuantity: newInvoicedQuantity },
            });
          }
        }

        const updated = await tx.purchaseInvoice.update({
          where: { id },
          data: { status: PurchaseInvoiceStatus.CANCELLED },
          include: INVOICE_INCLUDE,
        });
        return { invoice: updated, previousStatus: existing.status };
      },
    );

    await this.audit.record({
      actor,
      action: 'purchase-invoice.cancelled',
      resource: 'purchase-invoice',
      resourceId: posted.id,
      metadata: { purchaseOrderId: posted.purchaseOrderId, previousStatus },
      request,
    });

    // Cancellation itself is already committed and correct at this point,
    // independent of everything below (approved Phase C1/C2 design).
    //
    // - accountingPostingStatus POSTED (a journal really was posted): the
    //   only case with anything to reverse — attempt it, post-commit,
    //   best-effort (a failure here never fails cancel(); it just leaves
    //   accountingPostingStatus at POSTED for later manual reconciliation).
    // - NOT_POSTED or FAILED: there is no posted journal to reverse — do
    //   nothing accounting-side, leave the status exactly as it was. This
    //   is the explicit branch correction 3 requires: never attempt a
    //   reversal against a journal that was never successfully created.
    let finalRow = posted;
    if (
      posted.accountingPostingStatus === PurchaseInvoicePostingStatus.POSTED &&
      posted.journalEntryId
    ) {
      const { invoice: reversed } = await this.attemptInvoiceReversal(
        actor,
        posted,
        request,
      );
      finalRow = reversed;
    }

    return this.toResponse(actor, finalRow);
  }

  /**
   * Records a Supplier Payment against a CONFIRMED PurchaseInvoice's balance
   * (Section 22.9, Phase B). Mirrors SalesInvoicesService.recordPayment()
   * exactly: the PurchaseInvoice row is locked FOR UPDATE for the duration
   * of the transaction so the balance-due check and the amountPaid/
   * paymentStatus update happen against a single, serialized read — never an
   * application-level read taken outside the transaction. No reversal/
   * cancellation endpoint exists, matching Sales Payment's own current state
   * (Section 21.4) — not proposed for V1.
   */
  async recordPayment(
    actor: ActorContext,
    id: string,
    dto: CreateSupplierPaymentDto,
    request?: RequestAuditMeta,
  ) {
    const amount = parseMoney(dto.amount);
    if (amount.lte(0)) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }

    const { invoice, payment } = await this.prisma.$transaction(async (tx) => {
      const lockRows = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          SELECT id FROM purchase_invoices
          WHERE id = ${id}::uuid AND "tenantId" = ${actor.tenantId}::uuid
          FOR UPDATE
        `,
      );
      if (!lockRows[0]) {
        throw new NotFoundException('Purchase invoice not found');
      }

      const existing = await tx.purchaseInvoice.findFirstOrThrow({
        where: { id, tenantId: actor.tenantId },
      });

      if (existing.status !== PurchaseInvoiceStatus.CONFIRMED) {
        throw new ConflictException(
          'Only CONFIRMED purchase invoices can receive payments',
        );
      }
      if (existing.paymentStatus === PurchaseInvoicePaymentStatus.PAID) {
        throw new ConflictException('Purchase invoice is already fully paid');
      }

      const balanceDue = existing.total.minus(existing.amountPaid);
      if (amount.gt(balanceDue)) {
        throw new ConflictException(
          'Payment amount exceeds the remaining balance due',
        );
      }

      const createdPayment = await tx.supplierPayment.create({
        data: {
          tenantId: actor.tenantId,
          purchaseInvoiceId: id,
          amount,
          paymentDate: new Date(dto.paymentDate),
          paymentMethodId: dto.paymentMethodId ?? null,
          reference: dto.reference?.trim() || null,
          notes: dto.notes?.trim() || null,
        },
      });

      const newAmountPaid = existing.amountPaid.plus(amount);
      const newPaymentStatus = newAmountPaid.gte(existing.total)
        ? PurchaseInvoicePaymentStatus.PAID
        : PurchaseInvoicePaymentStatus.PARTIALLY_PAID;

      const updatedInvoice = await tx.purchaseInvoice.update({
        where: { id },
        data: { amountPaid: newAmountPaid, paymentStatus: newPaymentStatus },
        include: INVOICE_INCLUDE,
      });

      return { invoice: updatedInvoice, payment: createdPayment };
    });

    await this.audit.record({
      actor,
      action: 'purchase-invoice.payment-recorded',
      resource: 'purchase-invoice',
      resourceId: invoice.id,
      metadata: {
        paymentId: payment.id,
        amount: moneyToString(payment.amount),
        amountPaid: moneyToString(invoice.amountPaid),
        paymentStatus: invoice.paymentStatus,
      },
      request,
    });

    // Post-commit, best-effort — identical rationale to confirm() above.
    // SupplierPayment has no retry endpoint of its own in this phase (it
    // simply stays FAILED, matching its existing "no reversal/cancellation"
    // limitation) — this is its one and only posting attempt.
    const { payment: finalPayment } = await this.attemptPaymentPosting(
      actor,
      payment,
      request,
    );

    return {
      payment: toSupplierPaymentResponse(finalPayment),
      invoice: await this.toResponse(actor, invoice),
    };
  }

  async listPayments(actor: ActorContext, id: string) {
    await this.require(actor, id);
    const rows = await this.prisma.supplierPayment.findMany({
      where: { purchaseInvoiceId: id, tenantId: actor.tenantId },
      orderBy: [{ paymentDate: 'asc' }, { createdAt: 'asc' }],
    });
    return { items: rows.map(toSupplierPaymentResponse) };
  }

  /**
   * Manual retry for a purchase invoice whose accounting posting is
   * currently FAILED (or was never attempted). Rejected once the invoice is
   * CANCELLED — posting a fresh journal for a cancelled invoice would create
   * a real payable for a document the business no longer considers open,
   * closing the race where a stale/queued retry lands after cancellation.
   * Already-POSTED is a no-op (never calls accounting-service again) rather
   * than an error — retrying an already-successful posting is harmless.
   * Unlike confirm()'s post-commit best-effort call, a failure here is
   * surfaced to the caller: retrying IS the primary action being requested.
   */
  async retryAccountingPosting(
    actor: ActorContext,
    id: string,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.require(actor, id);

    if (existing.status === PurchaseInvoiceStatus.CANCELLED) {
      throw new ConflictException(
        'Cannot post accounting for a cancelled purchase invoice',
      );
    }

    if (existing.accountingPostingStatus === PurchaseInvoicePostingStatus.POSTED) {
      return this.toResponse(actor, existing);
    }

    const { invoice, error } = await this.attemptInvoicePosting(
      actor,
      existing,
      request,
    );
    if (error) {
      throw error;
    }

    await this.audit.record({
      actor,
      action: 'purchase-invoice.accounting-posting-retried',
      resource: 'purchase-invoice',
      resourceId: invoice.id,
      metadata: { journalEntryId: invoice.journalEntryId },
      request,
    });

    return this.toResponse(actor, invoice);
  }

  /**
   * Manual retry for a CANCELLED purchase invoice whose accounting reversal
   * (attempted post-commit inside cancel()) failed. Only meaningful once
   * cancelled — rejected otherwise. Distinguishes two CANCELLED states:
   * accountingPostingStatus POSTED (a journal really was posted and never
   * got reversed — the only case with anything to retry) vs. FAILED/
   * NOT_POSTED (there was never a posted journal to reverse in the first
   * place — a 409, not a silent no-op, since retrying that would be
   * meaningless). Already-REVERSED is a harmless no-op, never re-calling
   * accounting-service. Like retryAccountingPosting(), a renewed failure is
   * surfaced to the caller — retrying IS the primary action requested.
   */
  async retryAccountingReversal(
    actor: ActorContext,
    id: string,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.require(actor, id);

    if (existing.status !== PurchaseInvoiceStatus.CANCELLED) {
      throw new ConflictException(
        'Only a CANCELLED purchase invoice can have its accounting reversal retried',
      );
    }

    if (existing.accountingPostingStatus === PurchaseInvoicePostingStatus.REVERSED) {
      return this.toResponse(actor, existing);
    }

    if (
      existing.accountingPostingStatus !== PurchaseInvoicePostingStatus.POSTED ||
      !existing.journalEntryId
    ) {
      throw new ConflictException(
        'This purchase invoice has no posted accounting journal to reverse',
      );
    }

    const { invoice, error } = await this.attemptInvoiceReversal(
      actor,
      existing,
      request,
    );
    if (error) {
      throw error;
    }

    await this.audit.record({
      actor,
      action: 'purchase-invoice.accounting-reversal-retried',
      resource: 'purchase-invoice',
      resourceId: invoice.id,
      metadata: { reversalJournalEntryId: invoice.reversalJournalEntryId },
      request,
    });

    return this.toResponse(actor, invoice);
  }

  private async require(actor: ActorContext, id: string) {
    const row = await this.prisma.purchaseInvoice.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: INVOICE_INCLUDE,
    });
    if (!row) throw new NotFoundException('Purchase invoice not found');
    return row;
  }

  private buildInvoicePostingRequest(
    invoice: InvoicePostingSource,
  ): CreateJournalPostingRequest {
    const lines: CreateJournalPostingRequest['lines'] = [
      {
        role: 'PURCHASE_EXPENSE',
        side: 'DEBIT',
        amount: moneyToString(invoice.subtotal.minus(invoice.discountTotal)),
      },
    ];
    if (invoice.taxTotal.gt(0)) {
      lines.push({
        role: 'INPUT_TAX',
        side: 'DEBIT',
        amount: moneyToString(invoice.taxTotal),
      });
    }
    lines.push({
      role: 'ACCOUNTS_PAYABLE',
      side: 'CREDIT',
      amount: moneyToString(invoice.total),
    });

    return {
      sourceService: ACCOUNTING_SOURCE_SERVICE,
      sourceType: 'PURCHASE_INVOICE',
      sourceId: invoice.id,
      description: `${invoice.invoiceNumber} — ${invoice.supplierName}`,
      lines,
    };
  }

  /**
   * Attempts to post (or idempotently replay) this invoice's accounting
   * journal and persists the outcome as a Purchase-side cache — never
   * throws: the caller decides whether a failure should be surfaced
   * (retryAccountingPosting does; confirm()'s post-commit call does not).
   */
  private async attemptInvoicePosting(
    actor: ActorContext,
    invoice: InvoicePostingSource,
    request?: RequestAuditMeta,
  ) {
    try {
      const result = await this.accountingJournal.post(
        actor,
        this.buildInvoicePostingRequest(invoice),
      );
      const updated = await this.prisma.purchaseInvoice.update({
        where: { id: invoice.id },
        data: {
          accountingPostingStatus: PurchaseInvoicePostingStatus.POSTED,
          journalEntryId: result.id,
        },
        include: INVOICE_INCLUDE,
      });
      await this.audit.record({
        actor,
        action: 'purchase-invoice.accounting-posted',
        resource: 'purchase-invoice',
        resourceId: invoice.id,
        metadata: {
          journalEntryId: result.id,
          idempotentReplay: result.idempotentReplay,
        },
        request,
      });
      return { invoice: updated, error: undefined as unknown };
    } catch (error) {
      this.logger.error(
        `Failed to post accounting journal for purchase invoice ${invoice.id}`,
        error instanceof Error ? error.stack : undefined,
      );
      try {
        await this.prisma.purchaseInvoice.update({
          where: { id: invoice.id },
          data: { accountingPostingStatus: PurchaseInvoicePostingStatus.FAILED },
        });
      } catch (updateError) {
        this.logger.error(
          `Failed to record FAILED accounting posting status for purchase invoice ${invoice.id}`,
          updateError instanceof Error ? updateError.stack : undefined,
        );
      }
      const refreshed = await this.require(actor, invoice.id);
      return { invoice: refreshed, error };
    }
  }

  /**
   * Attempts to reverse (or idempotently replay the reversal of) this
   * invoice's already-POSTED accounting journal. The original journal entry
   * is never touched by this call — it is looked up read-only inside
   * accounting-service and stays POSTED permanently (approved design: no
   * VOID). On failure, accountingPostingStatus is deliberately left at
   * POSTED (nothing to update) rather than introduced a new failure state —
   * there is no dedicated retry-reversal endpoint in this phase.
   */
  private async attemptInvoiceReversal(
    actor: ActorContext,
    invoice: { id: string; invoiceNumber: string },
    request?: RequestAuditMeta,
  ) {
    try {
      const result = await this.accountingJournal.reverse(actor, {
        sourceService: ACCOUNTING_SOURCE_SERVICE,
        sourceType: 'PURCHASE_INVOICE',
        sourceId: invoice.id,
        reversalSourceType: 'PURCHASE_INVOICE_CANCELLATION',
        description: `Cancellation of ${invoice.invoiceNumber}`,
      });
      const updated = await this.prisma.purchaseInvoice.update({
        where: { id: invoice.id },
        data: {
          accountingPostingStatus: PurchaseInvoicePostingStatus.REVERSED,
          reversalJournalEntryId: result.id,
        },
        include: INVOICE_INCLUDE,
      });
      await this.audit.record({
        actor,
        action: 'purchase-invoice.accounting-reversed',
        resource: 'purchase-invoice',
        resourceId: invoice.id,
        metadata: {
          reversalJournalEntryId: result.id,
          idempotentReplay: result.idempotentReplay,
        },
        request,
      });
      return { invoice: updated, error: undefined as unknown };
    } catch (error) {
      this.logger.error(
        `Failed to reverse accounting journal for cancelled purchase invoice ${invoice.id}`,
        error instanceof Error ? error.stack : undefined,
      );
      const refreshed = await this.require(actor, invoice.id);
      return { invoice: refreshed, error };
    }
  }

  private buildPaymentPostingRequest(
    payment: PaymentPostingSource,
  ): CreateJournalPostingRequest | null {
    if (!payment.paymentMethodId) {
      return null;
    }
    return {
      sourceService: ACCOUNTING_SOURCE_SERVICE,
      sourceType: 'SUPPLIER_PAYMENT',
      sourceId: payment.id,
      lines: [
        {
          role: 'ACCOUNTS_PAYABLE',
          side: 'DEBIT',
          amount: moneyToString(payment.amount),
        },
        {
          role: 'PAYMENT_METHOD',
          side: 'CREDIT',
          amount: moneyToString(payment.amount),
          paymentMethodId: payment.paymentMethodId,
        },
      ],
    };
  }

  /**
   * Same post-commit, never-throws contract as attemptInvoicePosting(). A
   * payment with no paymentMethodId can never resolve a GL account (no
   * fallback exists for PAYMENT_METHOD — approved design), so it is marked
   * FAILED directly without even calling accounting-service.
   */
  private async attemptPaymentPosting(
    actor: ActorContext,
    payment: PaymentPostingSource,
    request?: RequestAuditMeta,
  ) {
    const postingRequest = this.buildPaymentPostingRequest(payment);
    if (!postingRequest) {
      this.logger.warn(
        `Supplier payment ${payment.id} has no paymentMethodId — cannot resolve a GL account; marking accounting posting FAILED without calling accounting-service`,
      );
      const updated = await this.prisma.supplierPayment.update({
        where: { id: payment.id },
        data: { accountingPostingStatus: SupplierPaymentPostingStatus.FAILED },
      });
      return {
        payment: updated,
        error: new Error(
          'Supplier payment has no paymentMethodId — cannot resolve a GL account',
        ) as unknown,
      };
    }

    try {
      const result = await this.accountingJournal.post(actor, postingRequest);
      const updated = await this.prisma.supplierPayment.update({
        where: { id: payment.id },
        data: {
          accountingPostingStatus: SupplierPaymentPostingStatus.POSTED,
          journalEntryId: result.id,
        },
      });
      await this.audit.record({
        actor,
        action: 'supplier-payment.accounting-posted',
        resource: 'supplier-payment',
        resourceId: payment.id,
        metadata: {
          journalEntryId: result.id,
          idempotentReplay: result.idempotentReplay,
        },
        request,
      });
      return { payment: updated, error: undefined as unknown };
    } catch (error) {
      this.logger.error(
        `Failed to post accounting journal for supplier payment ${payment.id}`,
        error instanceof Error ? error.stack : undefined,
      );
      let updated = await this.prisma.supplierPayment.findFirstOrThrow({
        where: { id: payment.id },
      });
      try {
        updated = await this.prisma.supplierPayment.update({
          where: { id: payment.id },
          data: { accountingPostingStatus: SupplierPaymentPostingStatus.FAILED },
        });
      } catch (updateError) {
        this.logger.error(
          `Failed to record FAILED accounting posting status for supplier payment ${payment.id}`,
          updateError instanceof Error ? updateError.stack : undefined,
        );
      }
      return { payment: updated, error };
    }
  }

  /**
   * Batches the PurchaseOrderItem lookup needed for three-way-matching flags
   * (Section 22.5, computed on read) across one or many invoice rows, then
   * maps each through toPurchaseInvoiceResponse(). purchaseOrderItemId is a
   * globally unique UUID, so a single `id IN (...)` query covers every row
   * regardless of which PO(s) they reference — no N+1 for list().
   */
  private async toResponses<
    T extends Parameters<typeof toPurchaseInvoiceResponse>[0],
  >(actor: ActorContext, rows: T[]): Promise<ReturnType<typeof toPurchaseInvoiceResponse>[]> {
    const poItemIds = Array.from(
      new Set(rows.flatMap((row) => row.items.map((item) => item.purchaseOrderItemId))),
    );
    const poItems =
      poItemIds.length === 0
        ? []
        : await this.prisma.purchaseOrderItem.findMany({
            where: { id: { in: poItemIds }, tenantId: actor.tenantId },
            select: { id: true, unitCost: true, discountPercent: true, taxCodeId: true },
          });
    const poItemsById = new Map<string, MismatchSourcePoItem>(
      poItems.map((item) => [item.id, item]),
    );
    return rows.map((row) => toPurchaseInvoiceResponse(row, poItemsById));
  }

  private async toResponse<T extends Parameters<typeof toPurchaseInvoiceResponse>[0]>(
    actor: ActorContext,
    row: T,
  ): Promise<ReturnType<typeof toPurchaseInvoiceResponse>> {
    const [response] = await this.toResponses(actor, [row]);
    return response;
  }

  /**
   * Sums quantities from other still-DRAFT PurchaseInvoiceItem rows for the
   * same PO, grouped by purchaseOrderItemId — the exact mirror of
   * GoodsReceiptsService.pendingQuantitiesByPurchaseOrderItem(), adapted for
   * DRAFT Purchase Invoices instead of PENDING_STOCK Goods Receipts.
   * excludeInvoiceId excludes the invoice currently being validated (its own
   * DRAFT lines must never be double-counted against itself).
   */
  private async draftQuantitiesByPurchaseOrderItem(
    client: Prisma.TransactionClient,
    tenantId: string,
    purchaseOrderId: string,
    excludeInvoiceId: string | null,
  ): Promise<Map<string, Prisma.Decimal>> {
    const rows = await client.purchaseInvoiceItem.findMany({
      where: {
        tenantId,
        purchaseInvoice: {
          purchaseOrderId,
          tenantId,
          status: PurchaseInvoiceStatus.DRAFT,
          ...(excludeInvoiceId ? { id: { not: excludeInvoiceId } } : {}),
        },
      },
    });
    const map = new Map<string, Prisma.Decimal>();
    for (const row of rows) {
      const current = map.get(row.purchaseOrderItemId) ?? new Prisma.Decimal(0);
      map.set(row.purchaseOrderItemId, current.plus(row.quantity));
    }
    return map;
  }

  /**
   * The three-way quantity gate: for each line (aggregated across this same
   * call's own lines first, so two lines against the same PO item within
   * one invoice are correctly summed rather than independently checked
   * against a stale bound), asserts
   *   committed invoicedQuantity + other-DRAFT-invoices' quantity
   *     + this invoice's own running total + this line
   *     <= receivedQuantity   (primary)
   *     <= orderedQuantity    (defense-in-depth, Section 22.5)
   * `client` is `this.prisma` for the unlocked soft check at create()/
   * update() time, or the locked `tx` for the hard check at confirm() time.
   */
  private async assertAvailableQuantity(
    client: Prisma.TransactionClient,
    actor: ActorContext,
    purchaseOrderId: string,
    poItemsById: Map<string, PoItemQuantityRow>,
    lines: Array<{ purchaseOrderItemId: string; quantity: Prisma.Decimal }>,
    excludeInvoiceId: string | null,
  ): Promise<void> {
    const otherDraft = await this.draftQuantitiesByPurchaseOrderItem(
      client,
      actor.tenantId,
      purchaseOrderId,
      excludeInvoiceId,
    );
    const selfConsumed = new Map<string, Prisma.Decimal>();
    for (const line of lines) {
      const poItem = poItemsById.get(line.purchaseOrderItemId);
      if (!poItem) {
        throw new NotFoundException('Purchase order item not found');
      }
      const already = selfConsumed.get(poItem.id) ?? new Prisma.Decimal(0);
      const otherDraftQty = otherDraft.get(poItem.id) ?? new Prisma.Decimal(0);

      const availableAgainstReceived = poItem.receivedQuantity
        .minus(poItem.invoicedQuantity)
        .minus(otherDraftQty)
        .minus(already);
      if (line.quantity.gt(availableAgainstReceived)) {
        throw new ConflictException(
          'Invoice quantity exceeds the remaining received quantity (net of already-invoiced and other in-progress draft invoices) for this purchase order line',
        );
      }

      const availableAgainstOrdered = poItem.quantity
        .minus(poItem.invoicedQuantity)
        .minus(otherDraftQty)
        .minus(already);
      if (line.quantity.gt(availableAgainstOrdered)) {
        throw new ConflictException(
          'Invoice quantity exceeds the remaining ordered quantity for this purchase order line',
        );
      }

      selfConsumed.set(poItem.id, already.plus(line.quantity));
    }
  }

  /**
   * Resolves and validates each DTO line against the loaded PO (and,
   * optionally, a GoodsReceiptItem), assembling the snapshot and calculation
   * for that line. Runs outside any transaction — every lookup here is a
   * plain tenant-scoped DB read (never an external HTTP call, since tax is
   * copied forward rather than re-resolved and UOM is never re-resolved).
   */
  private async resolveLines(
    actor: ActorContext,
    purchaseOrderId: string,
    poItems: PoItemRow[],
    items: CreatePurchaseInvoiceItemDto[],
  ): Promise<PurchaseInvoiceLine[]> {
    const poItemsById = new Map(poItems.map((item) => [item.id, item]));
    const seen = new Set<string>();
    const lines: PurchaseInvoiceLine[] = [];

    for (const dtoLine of items) {
      const poItem = poItemsById.get(dtoLine.purchaseOrderItemId);
      if (!poItem || poItem.tenantId !== actor.tenantId) {
        throw new NotFoundException('Purchase order item not found');
      }

      let grItem: GrItemRow | null = null;
      if (dtoLine.goodsReceiptItemId) {
        grItem = await this.prisma.goodsReceiptItem.findFirst({
          where: { id: dtoLine.goodsReceiptItemId, tenantId: actor.tenantId },
          include: { goodsReceipt: true },
        });
        if (!grItem) {
          throw new NotFoundException('Goods receipt item not found');
        }
        if (grItem.goodsReceipt.purchaseOrderId !== purchaseOrderId) {
          throw new BadRequestException(
            'Goods receipt item does not belong to the selected purchase order',
          );
        }
        if (grItem.purchaseOrderItemId !== poItem.id) {
          throw new BadRequestException(
            'Goods receipt item does not belong to the selected purchase order item',
          );
        }
      }

      const dedupeKey = `${poItem.id}|${grItem?.id ?? ''}`;
      if (seen.has(dedupeKey)) {
        throw new BadRequestException(
          'Duplicate purchase order item / goods receipt item pair in invoice',
        );
      }
      seen.add(dedupeKey);

      const quantity = parsePositiveDecimal(dtoLine.quantity);
      const unitCost = parseMoney(dtoLine.unitCost);
      const gross = roundMoney(quantity.mul(unitCost));
      const discountPercent = parsePercent(dtoLine.discountPercent ?? '0');
      const discountAmount = roundMoney(gross.mul(discountPercent).div(100));
      const lineSubtotal = gross.minus(discountAmount);

      // Product/UOM snapshot source (Correction 3): GoodsReceiptItem when
      // a GR reference is supplied, otherwise PurchaseOrderItem. Never
      // re-fetched from Product/inventory-service.
      const productSource = grItem ?? poItem;

      // Tax rate/code structure copied from the PO line, never re-resolved
      // via AccountingTaxCodeClient; amounts recomputed against THIS line's
      // own lineSubtotal, not copied as a verbatim dollar amount.
      const taxComponents: PurchaseInvoiceLineTaxComponent[] =
        poItem.taxComponents.map((component) => ({
          sequence: component.sequence,
          type: component.type,
          name: component.name,
          rate: component.rate,
          componentTaxAmount: roundMoney(
            lineSubtotal.mul(component.rate).div(100),
          ),
        }));
      const taxAmount = taxComponents.reduce(
        (sum, component) => sum.plus(component.componentTaxAmount),
        new Prisma.Decimal(0),
      );
      const lineTotal = lineSubtotal.plus(taxAmount);

      lines.push({
        purchaseOrderItemId: poItem.id,
        goodsReceiptItemId: grItem?.id ?? null,
        productId: productSource.productId,
        productSku: productSource.productSku,
        productName: productSource.productName,
        unitOfMeasureId: productSource.unitOfMeasureId,
        uomCode: productSource.uomCode,
        uomName: productSource.uomName,
        conversionFactor: productSource.conversionFactor,
        quantity,
        unitCost,
        gross,
        discountPercent,
        discountAmount,
        taxCodeId: poItem.taxCodeId,
        taxCode: poItem.taxCode,
        taxCodeName: poItem.taxCodeName,
        taxAmount,
        lineSubtotal,
        lineTotal,
        taxComponents,
      });
    }

    return lines;
  }

  private toItemCreateData(tenantId: string, line: PurchaseInvoiceLine) {
    return {
      tenantId,
      purchaseOrderItemId: line.purchaseOrderItemId,
      goodsReceiptItemId: line.goodsReceiptItemId,
      productId: line.productId,
      productSku: line.productSku,
      productName: line.productName,
      unitOfMeasureId: line.unitOfMeasureId,
      uomCode: line.uomCode,
      uomName: line.uomName,
      conversionFactor: line.conversionFactor,
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

  private sumTotals(lines: PurchaseInvoiceLine[]): {
    subtotal: Prisma.Decimal;
    discountTotal: Prisma.Decimal;
    taxTotal: Prisma.Decimal;
    total: Prisma.Decimal;
  } {
    const subtotal = lines.reduce(
      (sum, line) => sum.plus(line.gross),
      new Prisma.Decimal(0),
    );
    const discountTotal = lines.reduce(
      (sum, line) => sum.plus(line.discountAmount),
      new Prisma.Decimal(0),
    );
    const taxTotal = lines.reduce(
      (sum, line) => sum.plus(line.taxAmount),
      new Prisma.Decimal(0),
    );
    const total = subtotal.minus(discountTotal).plus(taxTotal);
    return { subtotal, discountTotal, taxTotal, total };
  }

  private async nextInvoiceNumber(tenantId: string): Promise<string> {
    const count = await this.prisma.purchaseInvoice.count({
      where: { tenantId },
    });
    return `PINV-${String(count + 1).padStart(8, '0')}`;
  }
}
