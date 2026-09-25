import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  GoodsReceiptPostingStatus,
  GoodsReceiptStatus,
  Prisma,
  PurchaseInvoicePaymentStatus,
  PurchaseInvoicePostingStatus,
  PurchaseInvoiceStatus,
  PurchaseOrderStatus,
  SupplierPaymentPostingStatus,
  SupplierPaymentStatus,
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
import { ReverseSupplierPaymentDto } from './dto/reverse-supplier-payment.dto';
import { toSupplierPaymentResponse } from './dto/supplier-payment-response';

const INVOICE_INCLUDE = {
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      taxComponents: { orderBy: { sequence: 'asc' as const } },
      // Phase 3.2 (GRNI Clearing / PPV) — only unitCost/baseQuantity are
      // ever read from this relation (buildInvoicePostingRequest); never
      // re-fetched separately at posting time.
      goodsReceiptItem: { select: { unitCost: true, baseQuantity: true } },
    },
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
  // Phase 3.2 (GRNI Clearing / PPV) snapshot — see PurchaseInvoiceLine below.
  productTracksInventory: boolean | null;
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
  productTracksInventory: boolean | null;
  goodsReceipt: {
    purchaseOrderId: string;
    status: string;
    accountingPostingStatus: string;
  };
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
  // Phase 3.2 (GRNI Clearing / PPV) — copied from productSource (GoodsReceiptItem
  // when goodsReceiptItemId is supplied, otherwise PurchaseOrderItem), never
  // re-fetched. NULL and false are always treated identically — only an
  // explicit true requires goodsReceiptItemId and participates in GRNI
  // clearing/PPV at confirm().
  productTracksInventory: boolean | null;
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

/**
 * Phase 3.2 (GRNI Clearing / PPV) — minimal per-line shape needed to decide
 * whether a line clears GRNI (productTracksInventory === true AND a matched
 * GoodsReceiptItem with a snapshotted unitCost) or falls back to the
 * pre-Phase-3.2 PURCHASE_EXPENSE treatment. Deliberately independent of
 * PurchaseInvoiceGoodsReceiptMatch — the clearing amount is a pure function
 * of already-persisted, immutable data (this line + its linked
 * GoodsReceiptItem.unitCost), recomputed identically whether this is the
 * initial post-confirm() posting attempt or a later retryAccountingPosting().
 */
interface InvoicePostingLineSource {
  productTracksInventory: boolean | null;
  goodsReceiptItemId: string | null;
  quantity: Prisma.Decimal;
  conversionFactor: Prisma.Decimal | null;
  lineSubtotal: Prisma.Decimal;
  goodsReceiptItem: {
    unitCost: Prisma.Decimal | null;
    baseQuantity: Prisma.Decimal | null;
  } | null;
}

/** Minimal shape needed to build a Purchase Invoice's accounting posting request. */
interface InvoicePostingSource {
  id: string;
  invoiceNumber: string;
  supplierName: string;
  subtotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  taxTotal: Prisma.Decimal;
  total: Prisma.Decimal;
  items: InvoicePostingLineSource[];
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

      // Phase 3.2 (GRNI Clearing / PPV) — hard, lock-protected re-check and
      // matchedQuantity accumulation for every inventory-tracked line. Runs
      // after the quantity check above and before invoicedQuantity is
      // committed, so a rejection here leaves no partial state written.
      await this.assertGoodsReceiptsMatchedAndAccumulate(tx, actor, invoice.items);

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
          // Phase 3.5 (Purchase Return) — a CONFIRMED invoice with any line
          // already consumed (in whole or in part) by a MATCHED_INVOICE
          // Purchase Return allocation can never be cancelled. cancel()
          // below unconditionally reverses this invoice's FULL original
          // AP/GRNI/PPV amounts; a prior Purchase Return already posted its
          // own, separate reversal for the returned portion, so cancelling
          // on top would double-reverse the accounting effect for that
          // quantity. There is no partial-cancel logic to handle this
          // correctly, so it is rejected outright, before any lock beyond
          // the invoice row itself is taken.
          if (existing.items.some((item) => item.returnedQuantity.gt(0))) {
            throw new ConflictException(
              'Cannot cancel a purchase invoice that has a Purchase Return recorded against one of its lines',
            );
          }

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

          // Phase 3.2 (GRNI Clearing / PPV) — symmetric reversal of
          // confirm()'s matchedQuantity accumulation.
          await this.reverseGoodsReceiptMatches(tx, actor, existing.items);
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
   * application-level read taken outside the transaction. Phase 3.8 adds a
   * reversal path for a recorded payment — see reversePayment() below; Sales
   * Payment's own identical gap (Section 21.4) is unchanged.
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

    // Post-commit, best-effort — identical rationale to confirm() above. A
    // FAILED outcome here is recoverable via retryPaymentAccountingPosting()
    // (Phase 3.8) rather than being permanently stuck.
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

  /**
   * Manual retry for a Supplier Payment whose original accounting posting
   * attempt (inside recordPayment()) never succeeded
   * (accountingPostingStatus FAILED or NOT_POSTED, e.g. a missing
   * paymentMethodId at the time or accounting-service being unreachable).
   * Rejected once the payment is REVERSED — posting a fresh journal for a
   * reversed payment would create a real AP/Bank effect for a payment the
   * business no longer considers active. Already-POSTED is a no-op (never
   * re-calls accounting-service). Mirrors
   * PurchaseInvoicesService.retryAccountingPosting() exactly (Phase 3.8).
   */
  async retryPaymentAccountingPosting(
    actor: ActorContext,
    invoiceId: string,
    paymentId: string,
    request?: RequestAuditMeta,
  ) {
    const payment = await this.requirePayment(actor, invoiceId, paymentId);

    if (payment.status === SupplierPaymentStatus.REVERSED) {
      throw new ConflictException(
        'Cannot post accounting for a reversed supplier payment',
      );
    }
    if (payment.accountingPostingStatus === SupplierPaymentPostingStatus.POSTED) {
      return toSupplierPaymentResponse(payment);
    }

    const { payment: updated, error } = await this.attemptPaymentPosting(
      actor,
      payment,
      request,
    );
    if (error) {
      throw error;
    }

    await this.audit.record({
      actor,
      action: 'supplier-payment.accounting-posting-retried',
      resource: 'supplier-payment',
      resourceId: updated.id,
      metadata: { journalEntryId: updated.journalEntryId },
      request,
    });

    return toSupplierPaymentResponse(updated);
  }

  /**
   * Phase 3.8 — ACTIVE -> REVERSED. Undoes a single Supplier Payment's
   * effect on PurchaseInvoice.amountPaid/paymentStatus and (post-commit,
   * best-effort) its posted AP/Bank journal. Idempotent: re-invoking on an
   * already-REVERSED payment is a no-op that never touches the invoice or
   * calls accounting again. Unlike GRNI matching, sibling payments on the
   * same invoice have no consumption relationship — any ACTIVE payment can
   * be reversed independently of any other, in any order. Reversing a
   * payment can make a CONFIRMED invoice's amountPaid drop back to 0,
   * un-blocking cancel()'s existing `amountPaid.gt(0)` guard — cancel()
   * itself is unmodified.
   */
  async reversePayment(
    actor: ActorContext,
    invoiceId: string,
    paymentId: string,
    dto: ReverseSupplierPaymentDto,
    request?: RequestAuditMeta,
  ) {
    // Soft, pre-transaction check: the common "already reversed" case never
    // needs to open a transaction or take any lock at all.
    const softPayment = await this.requirePayment(actor, invoiceId, paymentId);
    if (softPayment.status === SupplierPaymentStatus.REVERSED) {
      return {
        payment: toSupplierPaymentResponse(softPayment),
        invoice: await this.toResponse(actor, await this.require(actor, invoiceId)),
      };
    }

    const { invoice, payment, alreadyReversed } = await this.prisma.$transaction((tx) =>
      this.restoreAndReversePayment(tx, actor, invoiceId, paymentId, dto.reason),
    );

    if (alreadyReversed) {
      return {
        payment: toSupplierPaymentResponse(payment),
        invoice: await this.toResponse(actor, invoice),
      };
    }

    await this.audit.record({
      actor,
      action: 'supplier-payment.reversed',
      resource: 'supplier-payment',
      resourceId: payment.id,
      metadata: {
        purchaseInvoiceId: invoiceId,
        amount: moneyToString(payment.amount),
        reason: dto.reason?.trim() || null,
      },
      request,
    });

    // Cancellation itself is already committed and correct at this point,
    // independent of everything below (same principle as
    // PurchaseInvoicesService.cancel() and GoodsReceiptsService.reverse()).
    let finalPayment = payment;
    if (
      payment.accountingPostingStatus === SupplierPaymentPostingStatus.POSTED &&
      payment.journalEntryId
    ) {
      const { payment: reversed } = await this.attemptPaymentReversal(
        actor,
        payment,
        request,
      );
      finalPayment = reversed;
    }

    return {
      payment: toSupplierPaymentResponse(finalPayment),
      invoice: await this.toResponse(actor, invoice),
    };
  }

  /**
   * Manual retry for a REVERSED Supplier Payment whose accounting reversal
   * (attempted post-commit inside reversePayment()) failed. Mirrors
   * PurchaseInvoicesService.retryAccountingReversal() /
   * GoodsReceiptsService.retryAccountingReversal() exactly.
   */
  async retryPaymentAccountingReversal(
    actor: ActorContext,
    invoiceId: string,
    paymentId: string,
    request?: RequestAuditMeta,
  ) {
    const payment = await this.requirePayment(actor, invoiceId, paymentId);

    if (payment.status !== SupplierPaymentStatus.REVERSED) {
      throw new ConflictException(
        'Only a reversed supplier payment can have its accounting reversal retried',
      );
    }
    if (payment.accountingPostingStatus === SupplierPaymentPostingStatus.REVERSED) {
      return toSupplierPaymentResponse(payment);
    }
    if (
      payment.accountingPostingStatus !== SupplierPaymentPostingStatus.POSTED ||
      !payment.journalEntryId
    ) {
      throw new ConflictException(
        'This supplier payment has no posted accounting journal to reverse',
      );
    }

    const { payment: reversed, error } = await this.attemptPaymentReversal(
      actor,
      payment,
      request,
    );
    if (error) {
      throw error;
    }

    await this.audit.record({
      actor,
      action: 'supplier-payment.accounting-reversal-retried',
      resource: 'supplier-payment',
      resourceId: reversed.id,
      metadata: { reversalJournalEntryId: reversed.reversalJournalEntryId },
      request,
    });

    return toSupplierPaymentResponse(reversed);
  }

  private async require(actor: ActorContext, id: string) {
    const row = await this.prisma.purchaseInvoice.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: INVOICE_INCLUDE,
    });
    if (!row) throw new NotFoundException('Purchase invoice not found');
    return row;
  }

  /**
   * Phase 3.8 — tenant- and parent-invoice-scoped lookup for a single
   * Supplier Payment. 404s if the invoice itself doesn't exist/isn't in this
   * tenant, or if the payment doesn't exist/isn't a child of that invoice —
   * never leaks a cross-invoice or cross-tenant payment id.
   */
  private async requirePayment(
    actor: ActorContext,
    invoiceId: string,
    paymentId: string,
  ) {
    await this.require(actor, invoiceId);
    const payment = await this.prisma.supplierPayment.findFirst({
      where: { id: paymentId, tenantId: actor.tenantId, purchaseInvoiceId: invoiceId },
    });
    if (!payment) throw new NotFoundException('Supplier payment not found');
    return payment;
  }

  /**
   * Phase 3.2 (GRNI Clearing / PPV). Splits what used to be a single
   * unconditional PURCHASE_EXPENSE line into three buckets:
   *
   *   expensePortion    — lines that are NOT a matched inventory-tracked
   *                       line (non-inventory, historical NULL, or the
   *                       productTracksInventory === false case) — treated
   *                       byte-for-byte like every PurchaseInvoice line was
   *                       before this phase.
   *   grniClearingTotal — Σ(invoiceLineBaseQty × receipt unitCost) over
   *                       matched inventory lines. Reuses the exact formula
   *                       Phase 3.1 used to CREDIT GRNI at receipt time, so
   *                       clearing always nets to zero against whatever was
   *                       actually accrued, regardless of any deeper
   *                       UOM/cost convention question (never re-derived).
   *   ppvTotal          — Σ(lineSubtotal) over matched lines, minus
   *                       grniClearingTotal. Positive (invoice cost >
   *                       receipt cost, unfavorable) debits PPV; negative
   *                       (invoice cost < receipt cost, favorable) credits
   *                       it; exactly zero omits the line.
   *
   * Algebraically, expensePortion + grniClearingTotal + ppvTotal always
   * equals subtotal - discountTotal (the old single PURCHASE_EXPENSE
   * amount), so the journal balances against ACCOUNTS_PAYABLE/INPUT_TAX
   * exactly as before regardless of ppvTotal's sign. When no line is a
   * matched inventory-tracked line, this produces the identical journal
   * Phase 3.1-era code would have produced (no GRNI/PPV lines at all).
   */
  private buildInvoicePostingRequest(
    invoice: InvoicePostingSource,
  ): CreateJournalPostingRequest {
    let expensePortion = new Prisma.Decimal(0);
    let grniClearingTotal = new Prisma.Decimal(0);
    let matchedInvoiceValue = new Prisma.Decimal(0);

    for (const item of invoice.items) {
      const isMatchedInventoryLine =
        item.productTracksInventory === true &&
        item.goodsReceiptItemId !== null &&
        item.goodsReceiptItem?.unitCost != null;

      if (isMatchedInventoryLine) {
        const baseQty = item.quantity.mul(
          item.conversionFactor ?? new Prisma.Decimal(1),
        );
        grniClearingTotal = grniClearingTotal.plus(
          baseQty.mul(item.goodsReceiptItem!.unitCost!),
        );
        matchedInvoiceValue = matchedInvoiceValue.plus(item.lineSubtotal);
      } else {
        expensePortion = expensePortion.plus(item.lineSubtotal);
      }
    }
    const ppvTotal = matchedInvoiceValue.minus(grniClearingTotal);

    const lines: CreateJournalPostingRequest['lines'] = [];
    if (expensePortion.gt(0)) {
      lines.push({
        role: 'PURCHASE_EXPENSE',
        side: 'DEBIT',
        amount: moneyToString(expensePortion),
      });
    }
    if (grniClearingTotal.gt(0)) {
      lines.push({
        role: 'GOODS_RECEIVED_NOT_INVOICED',
        side: 'DEBIT',
        amount: moneyToString(grniClearingTotal),
      });
    }
    if (ppvTotal.gt(0)) {
      // Invoice cost > receipt cost — unfavorable variance.
      lines.push({
        role: 'PURCHASE_PRICE_VARIANCE',
        side: 'DEBIT',
        amount: moneyToString(ppvTotal),
      });
    } else if (ppvTotal.lt(0)) {
      // Invoice cost < receipt cost — favorable variance.
      lines.push({
        role: 'PURCHASE_PRICE_VARIANCE',
        side: 'CREDIT',
        amount: moneyToString(ppvTotal.abs()),
      });
    }
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
   * Attempts to reverse (or idempotently replay the reversal of) a Supplier
   * Payment's already-POSTED accounting journal. The original journal entry
   * is never touched — looked up read-only inside accounting-service and
   * stays POSTED permanently (approved design: no VOID). On failure,
   * accountingPostingStatus is deliberately left at POSTED (nothing to
   * update) rather than introducing a new failure state — mirrors
   * attemptInvoiceReversal() exactly (Phase 3.8).
   */
  private async attemptPaymentReversal(
    actor: ActorContext,
    payment: { id: string },
    request?: RequestAuditMeta,
  ) {
    try {
      const result = await this.accountingJournal.reverse(actor, {
        sourceService: ACCOUNTING_SOURCE_SERVICE,
        sourceType: 'SUPPLIER_PAYMENT',
        sourceId: payment.id,
        reversalSourceType: 'SUPPLIER_PAYMENT_REVERSAL',
        description: `Reversal of supplier payment ${payment.id}`,
      });
      const updated = await this.prisma.supplierPayment.update({
        where: { id: payment.id },
        data: {
          accountingPostingStatus: SupplierPaymentPostingStatus.REVERSED,
          reversalJournalEntryId: result.id,
        },
      });
      await this.audit.record({
        actor,
        action: 'supplier-payment.accounting-reversed',
        resource: 'supplier-payment',
        resourceId: payment.id,
        metadata: {
          reversalJournalEntryId: result.id,
          idempotentReplay: result.idempotentReplay,
        },
        request,
      });
      return { payment: updated, error: undefined as unknown };
    } catch (error) {
      this.logger.error(
        `Failed to reverse accounting journal for reversed supplier payment ${payment.id}`,
        error instanceof Error ? error.stack : undefined,
      );
      const refreshed = await this.prisma.supplierPayment.findFirstOrThrow({
        where: { id: payment.id },
      });
      return { payment: refreshed, error };
    }
  }

  /**
   * The restoration algorithm for reversePayment(), entirely inside one
   * transaction. Lock order — purchase_invoices (single row) ->
   * supplier_payments (single row) — the shortest chain in this module,
   * since a payment has no children and no sibling rows that need
   * re-validating (unlike GRNI matching, sibling payments on the same
   * invoice have no consumption relationship). Matches recordPayment()'s own
   * parent-before-child ordering, so the two can never deadlock against each
   * other. Re-verifies the ACTIVE/REVERSED state under lock (closing the
   * race window against a concurrent reversePayment() call for the same
   * payment) rather than trusting the caller's soft, pre-transaction read.
   */
  private async restoreAndReversePayment(
    tx: Prisma.TransactionClient,
    actor: ActorContext,
    invoiceId: string,
    paymentId: string,
    reason: string | undefined,
  ) {
    const invoiceLockRows = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        SELECT id FROM purchase_invoices
        WHERE id = ${invoiceId}::uuid AND "tenantId" = ${actor.tenantId}::uuid
        FOR UPDATE
      `,
    );
    if (!invoiceLockRows[0]) throw new NotFoundException('Purchase invoice not found');

    const paymentLockRows = await tx.$queryRaw<
      Array<{ id: string; status: string; purchaseInvoiceId: string }>
    >(
      Prisma.sql`
        SELECT id, status::text AS status, "purchaseInvoiceId"
        FROM supplier_payments
        WHERE id = ${paymentId}::uuid AND "tenantId" = ${actor.tenantId}::uuid
        FOR UPDATE
      `,
    );
    const lockedPayment = paymentLockRows[0];
    if (!lockedPayment || lockedPayment.purchaseInvoiceId !== invoiceId) {
      throw new NotFoundException('Supplier payment not found');
    }

    if (lockedPayment.status === SupplierPaymentStatus.REVERSED) {
      const [invoice, payment] = await Promise.all([
        tx.purchaseInvoice.findFirstOrThrow({
          where: { id: invoiceId, tenantId: actor.tenantId },
          include: INVOICE_INCLUDE,
        }),
        tx.supplierPayment.findFirstOrThrow({
          where: { id: paymentId, tenantId: actor.tenantId },
        }),
      ]);
      return { invoice, payment, alreadyReversed: true as const };
    }

    const existingInvoice = await tx.purchaseInvoice.findFirstOrThrow({
      where: { id: invoiceId, tenantId: actor.tenantId },
    });
    if (existingInvoice.status !== PurchaseInvoiceStatus.CONFIRMED) {
      // Data-integrity guard — should never trigger under correct operation:
      // an invoice can only reach CANCELLED once amountPaid is back to 0,
      // which requires every ACTIVE payment (including this one) to already
      // be REVERSED. Surfaced as an error rather than silently allowed.
      throw new ConflictException(
        'Only a CONFIRMED purchase invoice can have a payment reversed',
      );
    }

    const existingPayment = await tx.supplierPayment.findFirstOrThrow({
      where: { id: paymentId, tenantId: actor.tenantId },
    });

    const newAmountPaid = existingInvoice.amountPaid.minus(existingPayment.amount);
    if (newAmountPaid.lt(0)) {
      // Data-integrity guard — should never trigger under correct operation
      // (mirrors the invoicedQuantity/matchedQuantity-negative guards
      // elsewhere in this file).
      throw new ConflictException(
        'Reversing this payment would drive amountPaid negative for the purchase invoice',
      );
    }
    const newPaymentStatus = newAmountPaid.lte(0)
      ? PurchaseInvoicePaymentStatus.UNPAID
      : newAmountPaid.gte(existingInvoice.total)
        ? PurchaseInvoicePaymentStatus.PAID
        : PurchaseInvoicePaymentStatus.PARTIALLY_PAID;

    const updatedInvoice = await tx.purchaseInvoice.update({
      where: { id: invoiceId },
      data: { amountPaid: newAmountPaid, paymentStatus: newPaymentStatus },
      include: INVOICE_INCLUDE,
    });

    const updatedPayment = await tx.supplierPayment.update({
      where: { id: paymentId },
      data: {
        status: SupplierPaymentStatus.REVERSED,
        reversedAt: new Date(),
        reversalReason: reason?.trim() || null,
      },
    });

    return { invoice: updatedInvoice, payment: updatedPayment, alreadyReversed: false as const };
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
   * Phase 3.2 (GRNI Clearing / PPV) — the hard, lock-protected gate for
   * every inventory-tracked line (productTracksInventory === true) in this
   * invoice. Called only from confirm()'s own locked transaction (never
   * from create()/update()'s unlocked soft check, which only re-validates
   * that a goodsReceiptItemId is present — see resolveLines).
   *
   * Lock order (appended to confirm()'s existing purchase_invoices ->
   * purchase_orders -> purchase_order_items chain, never reordering it):
   *   goods_receipt_items -> purchase_invoice_goods_receipt_matches
   * Both locked in ascending id order when more than one row is involved.
   * A future Purchase Return implementation MUST follow this same order
   * (acquiring these two tables last, in ascending id order) to avoid
   * deadlocking against Invoice Confirm.
   *
   * For each matched line, asserts
   *   matchedQuantity + returnedQuantity + invoiceLineBaseQty <= baseQuantity
   * then accumulates matchedQuantity. Also requires the linked
   * GoodsReceipt to be fully POSTED (physically received AND its GRNI
   * accrual successfully posted to accounting-service) — clearing GRNI
   * against a receipt whose accrual never posted would debit an account
   * that was never credited.
   */
  private async assertGoodsReceiptsMatchedAndAccumulate(
    tx: Prisma.TransactionClient,
    actor: ActorContext,
    items: Array<{
      productTracksInventory: boolean | null;
      goodsReceiptItemId: string | null;
      quantity: Prisma.Decimal;
      conversionFactor: Prisma.Decimal | null;
    }>,
  ): Promise<void> {
    const matchedItems = items.filter(
      (item) => item.productTracksInventory === true,
    );
    if (matchedItems.length === 0) return;

    if (matchedItems.some((item) => !item.goodsReceiptItemId)) {
      throw new ConflictException(
        'A goods receipt is required for every inventory-tracked line before this invoice can be confirmed',
      );
    }
    const grItemIds = Array.from(
      new Set(matchedItems.map((item) => item.goodsReceiptItemId as string)),
    );

    // Lock the receipt items first (immutable after creation, but locked
    // for consistency with the documented lock-order rule above).
    const grItemRows = await tx.$queryRaw<
      Array<{
        id: string;
        goodsReceiptId: string;
        baseQuantity: Prisma.Decimal | null;
        unitCost: Prisma.Decimal | null;
      }>
    >(
      Prisma.sql`
        SELECT id, "goodsReceiptId", "baseQuantity", "unitCost"
        FROM goods_receipt_items
        WHERE id = ANY(${grItemIds}::uuid[]) AND "tenantId" = ${actor.tenantId}::uuid
        ORDER BY id
        FOR UPDATE
      `,
    );
    const grItemsById = new Map(grItemRows.map((row) => [row.id, row]));
    for (const grItemId of grItemIds) {
      if (!grItemsById.get(grItemId)) {
        throw new NotFoundException('Goods receipt item not found');
      }
    }

    const receiptIds = Array.from(
      new Set(grItemRows.map((row) => row.goodsReceiptId)),
    );
    const receipts = await tx.goodsReceipt.findMany({
      where: { id: { in: receiptIds }, tenantId: actor.tenantId },
      select: { id: true, status: true, accountingPostingStatus: true },
    });
    const receiptsById = new Map(receipts.map((row) => [row.id, row]));

    for (const grItemId of grItemIds) {
      const grItem = grItemsById.get(grItemId)!;
      const receipt = receiptsById.get(grItem.goodsReceiptId);
      if (
        !receipt ||
        receipt.status !== GoodsReceiptStatus.POSTED ||
        receipt.accountingPostingStatus !== GoodsReceiptPostingStatus.POSTED
      ) {
        throw new ConflictException(
          'Required goods receipt has not been posted to inventory/accounting yet',
        );
      }
      if (grItem.baseQuantity === null || grItem.unitCost === null) {
        throw new ConflictException(
          'Goods receipt item is missing base quantity or cost information',
        );
      }
    }

    // Lazily create, then lock, the match row for each referenced receipt
    // item — same ascending order as the lock above.
    for (const grItemId of grItemIds) {
      await tx.purchaseInvoiceGoodsReceiptMatch.upsert({
        where: { goodsReceiptItemId: grItemId },
        create: { tenantId: actor.tenantId, goodsReceiptItemId: grItemId },
        update: {},
      });
    }
    const matchRows = await tx.$queryRaw<
      Array<{
        id: string;
        goodsReceiptItemId: string;
        matchedQuantity: Prisma.Decimal;
        returnedQuantity: Prisma.Decimal;
      }>
    >(
      Prisma.sql`
        SELECT id, "goodsReceiptItemId", "matchedQuantity", "returnedQuantity"
        FROM purchase_invoice_goods_receipt_matches
        WHERE "goodsReceiptItemId" = ANY(${grItemIds}::uuid[]) AND "tenantId" = ${actor.tenantId}::uuid
        ORDER BY "goodsReceiptItemId"
        FOR UPDATE
      `,
    );
    const matchByGrItemId = new Map(
      matchRows.map((row) => [row.goodsReceiptItemId, row]),
    );

    // Dedupe within this invoice is already guaranteed by resolveLines'
    // (purchaseOrderItemId, goodsReceiptItemId) uniqueness check, but this
    // additional-per-GR-item map still generalizes correctly if that ever
    // changes, exactly like assertAvailableQuantity's selfConsumed map.
    const additionalByGrItemId = new Map<string, Prisma.Decimal>();
    for (const item of matchedItems) {
      const grItemId = item.goodsReceiptItemId as string;
      const grItem = grItemsById.get(grItemId)!;
      const match = matchByGrItemId.get(grItemId)!;
      const invoiceLineBaseQty = item.quantity.mul(
        item.conversionFactor ?? new Prisma.Decimal(1),
      );
      const already = additionalByGrItemId.get(grItemId) ?? new Prisma.Decimal(0);
      const projected = match.matchedQuantity
        .plus(match.returnedQuantity)
        .plus(already)
        .plus(invoiceLineBaseQty);
      if (projected.gt(grItem.baseQuantity as Prisma.Decimal)) {
        throw new ConflictException(
          'Invoice quantity exceeds the matchable goods receipt quantity for this line',
        );
      }
      additionalByGrItemId.set(grItemId, already.plus(invoiceLineBaseQty));
    }

    for (const [grItemId, additional] of additionalByGrItemId) {
      const match = matchByGrItemId.get(grItemId)!;
      await tx.purchaseInvoiceGoodsReceiptMatch.update({
        where: { id: match.id },
        data: { matchedQuantity: match.matchedQuantity.plus(additional) },
      });
    }
  }

  /**
   * Phase 3.2 (GRNI Clearing / PPV) — symmetric reversal of
   * assertGoodsReceiptsMatchedAndAccumulate, called from cancel()'s
   * CONFIRMED -> CANCELLED path. Recomputes each matched line's base
   * quantity identically (never a different formula) and decrements the
   * match row by the same amount that was added at confirm() time. Only
   * the match rows need locking here — goods_receipt_items is never
   * written by this path (baseQuantity/unitCost are immutable), so it is
   * not re-locked.
   */
  private async reverseGoodsReceiptMatches(
    tx: Prisma.TransactionClient,
    actor: ActorContext,
    items: Array<{
      productTracksInventory: boolean | null;
      goodsReceiptItemId: string | null;
      quantity: Prisma.Decimal;
      conversionFactor: Prisma.Decimal | null;
    }>,
  ): Promise<void> {
    const matchedItems = items.filter(
      (item) => item.productTracksInventory === true && item.goodsReceiptItemId,
    );
    if (matchedItems.length === 0) return;

    const grItemIds = Array.from(
      new Set(matchedItems.map((item) => item.goodsReceiptItemId as string)),
    );
    const matchRows = await tx.$queryRaw<
      Array<{
        id: string;
        goodsReceiptItemId: string;
        matchedQuantity: Prisma.Decimal;
      }>
    >(
      Prisma.sql`
        SELECT id, "goodsReceiptItemId", "matchedQuantity"
        FROM purchase_invoice_goods_receipt_matches
        WHERE "goodsReceiptItemId" = ANY(${grItemIds}::uuid[]) AND "tenantId" = ${actor.tenantId}::uuid
        ORDER BY "goodsReceiptItemId"
        FOR UPDATE
      `,
    );
    const matchByGrItemId = new Map(
      matchRows.map((row) => [row.goodsReceiptItemId, row]),
    );

    const reductionByGrItemId = new Map<string, Prisma.Decimal>();
    for (const item of matchedItems) {
      const grItemId = item.goodsReceiptItemId as string;
      const invoiceLineBaseQty = item.quantity.mul(
        item.conversionFactor ?? new Prisma.Decimal(1),
      );
      const already = reductionByGrItemId.get(grItemId) ?? new Prisma.Decimal(0);
      reductionByGrItemId.set(grItemId, already.plus(invoiceLineBaseQty));
    }

    for (const [grItemId, reduction] of reductionByGrItemId) {
      const match = matchByGrItemId.get(grItemId);
      if (!match) {
        // Data-integrity guard — should never trigger under correct
        // operation (mirrors the invoicedQuantity-negative guard below).
        throw new ConflictException(
          'No goods receipt match record found to reverse for this line',
        );
      }
      const newMatchedQuantity = match.matchedQuantity.minus(reduction);
      if (newMatchedQuantity.lt(0)) {
        throw new ConflictException(
          'Cancelling this invoice would drive matchedQuantity negative for a goods receipt line',
        );
      }
      await tx.purchaseInvoiceGoodsReceiptMatch.update({
        where: { id: match.id },
        data: { matchedQuantity: newMatchedQuantity },
      });
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

      // Phase 3.2 (GRNI Clearing / PPV) — soft, fail-fast validation. The
      // authoritative, lock-protected re-check happens inside confirm()
      // (see assertGoodsReceiptRequired), since productTracksInventory is a
      // frozen snapshot that cannot change between here and confirm() time,
      // but the linked GoodsReceipt's own posting state can.
      if (productSource.productTracksInventory === true && !grItem) {
        throw new BadRequestException(
          'A goods receipt is required for this inventory-tracked line',
        );
      }

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
        productTracksInventory: productSource.productTracksInventory,
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
      productTracksInventory: line.productTracksInventory,
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
