import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SalesInvoiceStatus,
  SalesReturnPostingStatus,
  SalesReturnStatus,
} from '../../generated/prisma-client';
import {
  AccountingJournalClient,
  CreateJournalPostingRequest,
} from '../accounting/accounting-journal.client';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { ActorContext, RequestAuditMeta } from '../auth/actor-context';
import {
  moneyToString,
  parsePositiveDecimal,
  quantityToString,
  roundMoney,
} from '../common/decimal';
import { InventoryStockClient } from '../inventory/inventory-stock.client';
import { isUniqueConstraintError } from '../prisma/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSalesReturnDto } from './dto/sales-return.dto';
import { ReverseSalesReturnDto } from './dto/reverse-sales-return.dto';
import { toSalesReturnResponse } from './dto/sales-return-response';

const ACCOUNTING_SOURCE_SERVICE = 'sales-service';

const RETURN_INCLUDE = {
  items: { orderBy: { createdAt: 'asc' as const } },
};

type ReturnWithItems = Prisma.SalesReturnGetPayload<{
  include: typeof RETURN_INCLUDE;
}>;

/** One planned line, computed in-memory before any write (soft, pre-transaction). */
interface PlannedLine {
  salesInvoiceItemId: string | null;
  shipmentItemId: string | null;
  productId: string;
  productSku: string;
  productName: string;
  quantity: Prisma.Decimal;
  baseQuantity: Prisma.Decimal | null;
  unitPrice: Prisma.Decimal | null;
  discountPercent: Prisma.Decimal | null;
  discountAmount: Prisma.Decimal | null;
  taxCodeId: string | null;
  taxCode: string | null;
  taxCodeName: string | null;
  taxAmount: Prisma.Decimal | null;
  lineSubtotal: Prisma.Decimal | null;
  lineTotal: Prisma.Decimal | null;
}

/**
 * Sales Return / Credit Note V1 (Phase 3.12). No approval workflow: DRAFT ->
 * CONFIRMED directly, mirroring PurchaseReturn's own two-state shape.
 * create() does only structural, soft checks (no lock) — the authoritative
 * capacity check happens entirely inside confirm()'s own transaction, under
 * lock, exactly like every other document in this pattern (soft-check-at-
 * create, hard-check-at-confirm).
 *
 * Anchors to one SalesInvoice (the document being credited). Each line
 * optionally references a SalesInvoiceItem (drives revenue/tax/AR reversal)
 * and/or a ShipmentItem (drives inventory/COGS reversal + supplies the
 * original stock movement id) — at least one is required. Unlike Purchase
 * Return's two-bucket UNMATCHED_RECEIPT/MATCHED_INVOICE allocation (needed
 * because Purchase has a GRNI accrual gap between receipt and invoice),
 * Sales has no equivalent accrual: SalesInvoiceItem.returnedQuantity and
 * ShipmentItem.returnedQuantity are independent, simple capacity caps.
 */
@Injectable()
export class SalesReturnsService {
  private readonly logger = new Logger(SalesReturnsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryStockClient,
    private readonly accountingJournal: AccountingJournalClient,
    private readonly audit: IdentityAuditClient,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreateSalesReturnDto,
    request?: RequestAuditMeta,
  ) {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: dto.salesInvoiceId, tenantId: actor.tenantId },
      include: { items: true },
    });
    if (!invoice) throw new NotFoundException('Sales invoice not found');
    if (invoice.status !== SalesInvoiceStatus.SENT) {
      throw new ConflictException(
        'Only a SENT sales invoice can have a return created against it',
      );
    }

    // D13-style defense-in-depth — the DTO's own @AtLeastOneReturnReference()
    // and per-field @IsUUID() only run behind a ValidationPipe; the service
    // independently re-checks so a direct caller can never bypass it.
    const seenInvoiceItems = new Set<string>();
    const seenShipmentItems = new Set<string>();
    for (const line of dto.items) {
      if (!line.salesInvoiceItemId && !line.shipmentItemId) {
        throw new BadRequestException(
          'Each sales return line must reference at least one of salesInvoiceItemId or shipmentItemId',
        );
      }
      if (line.salesInvoiceItemId) {
        if (seenInvoiceItems.has(line.salesInvoiceItemId)) {
          throw new BadRequestException(
            'Duplicate salesInvoiceItemId in sales return',
          );
        }
        seenInvoiceItems.add(line.salesInvoiceItemId);
      }
      if (line.shipmentItemId) {
        if (seenShipmentItems.has(line.shipmentItemId)) {
          throw new BadRequestException(
            'Duplicate shipmentItemId in sales return',
          );
        }
        seenShipmentItems.add(line.shipmentItemId);
      }
    }

    const invoiceItemsById = new Map(invoice.items.map((item) => [item.id, item]));

    const shipmentItemIds = dto.items
      .map((line) => line.shipmentItemId)
      .filter((id): id is string => !!id);
    const shipmentItems = shipmentItemIds.length
      ? await this.prisma.shipmentItem.findMany({
          where: { id: { in: shipmentItemIds }, tenantId: actor.tenantId },
          include: { shipment: { select: { warehouseId: true } } },
        })
      : [];
    const shipmentItemsById = new Map(shipmentItems.map((item) => [item.id, item]));

    let warehouseId: string | null = null;
    const lines: PlannedLine[] = [];

    for (const line of dto.items) {
      const invoiceItem = line.salesInvoiceItemId
        ? invoiceItemsById.get(line.salesInvoiceItemId)
        : undefined;
      if (
        line.salesInvoiceItemId &&
        (!invoiceItem || invoiceItem.salesInvoiceId !== invoice.id)
      ) {
        throw new NotFoundException('Sales invoice item not found');
      }

      const shipmentItem = line.shipmentItemId
        ? shipmentItemsById.get(line.shipmentItemId)
        : undefined;
      if (line.shipmentItemId && !shipmentItem) {
        throw new NotFoundException('Shipment item not found');
      }
      if (shipmentItem) {
        if (!shipmentItem.inventoryMovementId) {
          throw new ConflictException(
            `Shipment line for product ${shipmentItem.productSku} predates Sales Return support and cannot be returned`,
          );
        }
        if (shipmentItem.baseQuantity === null) {
          throw new ConflictException(
            'Shipment item is missing base quantity information',
          );
        }
        if (warehouseId && warehouseId !== shipmentItem.shipment.warehouseId) {
          throw new ConflictException(
            'All shipment-linked lines in one sales return must belong to the same warehouse',
          );
        }
        warehouseId = shipmentItem.shipment.warehouseId;
      }

      const quantity = parsePositiveDecimal(line.quantity);

      // Soft capacity checks (re-verified under lock in confirm()).
      if (invoiceItem) {
        const remaining = invoiceItem.quantity.minus(invoiceItem.returnedQuantity);
        if (quantity.gt(remaining)) {
          throw new ConflictException(
            'Return quantity exceeds the returnable quantity for a sales invoice line',
          );
        }
      }

      const conversionFactor =
        invoiceItem?.conversionFactor ??
        shipmentItem?.conversionFactor ??
        new Prisma.Decimal(1);
      const baseQuantity = shipmentItem
        ? quantity.mul(conversionFactor).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP)
        : null;

      if (shipmentItem && baseQuantity) {
        const remainingBase = shipmentItem.baseQuantity!.minus(
          shipmentItem.returnedQuantity,
        );
        if (baseQuantity.gt(remainingBase)) {
          throw new ConflictException(
            'Return quantity exceeds the returnable quantity for a shipment line',
          );
        }
      }

      const productId = invoiceItem?.productId ?? shipmentItem!.productId;
      const productSku = invoiceItem?.productSku ?? shipmentItem!.productSku;
      const productName = invoiceItem?.productName ?? shipmentItem!.productName;

      let unitPrice: Prisma.Decimal | null = null;
      let discountPercent: Prisma.Decimal | null = null;
      let discountAmount: Prisma.Decimal | null = null;
      let taxCodeId: string | null = null;
      let taxCode: string | null = null;
      let taxCodeName: string | null = null;
      let taxAmount: Prisma.Decimal | null = null;
      let lineSubtotal: Prisma.Decimal | null = null;
      let lineTotal: Prisma.Decimal | null = null;

      if (invoiceItem) {
        // Pro-rate the invoice line's own snapshotted pricing by the
        // fraction of the line being returned — never re-derived from
        // current product/tax-code state. A full-line return (fraction 1,
        // the common case) is exact; a partial-quantity return may carry a
        // sub-cent rounding difference across the four scaled fields, an
        // accepted characteristic mirroring Purchase Return's own PPV
        // rounding trade-off.
        const fraction = quantity.div(invoiceItem.quantity);
        unitPrice = invoiceItem.unitPrice;
        discountPercent = invoiceItem.discountPercent;
        discountAmount = roundMoney(invoiceItem.discountAmount.mul(fraction));
        taxCodeId = invoiceItem.taxCodeId;
        taxCode = invoiceItem.taxCode;
        taxCodeName = invoiceItem.taxCodeName;
        taxAmount = roundMoney(invoiceItem.taxAmount.mul(fraction));
        lineSubtotal = roundMoney(invoiceItem.lineSubtotal.mul(fraction));
        lineTotal = roundMoney(invoiceItem.lineTotal.mul(fraction));
      }

      lines.push({
        salesInvoiceItemId: invoiceItem?.id ?? null,
        shipmentItemId: shipmentItem?.id ?? null,
        productId,
        productSku,
        productName,
        quantity,
        baseQuantity,
        unitPrice,
        discountPercent,
        discountAmount,
        taxCodeId,
        taxCode,
        taxCodeName,
        taxAmount,
        lineSubtotal,
        lineTotal,
      });
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const returnNumber = await this.nextReturnNumber(actor.tenantId);
      try {
        const row = await this.prisma.salesReturn.create({
          data: {
            tenantId: actor.tenantId,
            returnNumber,
            salesInvoiceId: invoice.id,
            warehouseId,
            reason: dto.reason?.trim() || null,
            items: {
              create: lines.map((line) => ({
                tenantId: actor.tenantId,
                salesInvoiceItemId: line.salesInvoiceItemId,
                shipmentItemId: line.shipmentItemId,
                productId: line.productId,
                productSku: line.productSku,
                productName: line.productName,
                quantity: line.quantity,
                baseQuantity: line.baseQuantity,
                unitPrice: line.unitPrice,
                discountPercent: line.discountPercent,
                discountAmount: line.discountAmount,
                taxCodeId: line.taxCodeId,
                taxCode: line.taxCode,
                taxCodeName: line.taxCodeName,
                taxAmount: line.taxAmount,
                lineSubtotal: line.lineSubtotal,
                lineTotal: line.lineTotal,
              })),
            },
          },
          include: RETURN_INCLUDE,
        });
        await this.audit.record({
          actor,
          action: 'sales-return.created',
          resource: 'sales-return',
          resourceId: row.id,
          metadata: {
            returnNumber: row.returnNumber,
            salesInvoiceId: row.salesInvoiceId,
            itemCount: row.items.length,
          },
          request,
        });
        return toSalesReturnResponse(row);
      } catch (error) {
        if (isUniqueConstraintError(error) && attempt < 4) {
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException('Could not allocate sales return number');
  }

  /**
   * Phase 3.12 — DRAFT -> CONFIRMED. Calls Inventory (for shipment-linked
   * lines) as a hard dependency BEFORE opening the DB transaction — mirrors
   * PurchaseReturnsService.confirm()'s own applyReturn()-before-transaction
   * ordering exactly. Already-CONFIRMED is an idempotent no-op (never
   * re-calls Inventory or re-mutates).
   */
  async confirm(actor: ActorContext, id: string, request?: RequestAuditMeta) {
    const existing = await this.require(actor, id);
    if (existing.status === SalesReturnStatus.CONFIRMED) {
      return toSalesReturnResponse(existing);
    }
    if (existing.status !== SalesReturnStatus.DRAFT) {
      throw new ConflictException('Sales return cannot be confirmed');
    }

    const shipmentLinkedItems = existing.items.filter(
      (item) => item.shipmentItemId && item.baseQuantity,
    );
    let movementsByReturnItemId = new Map<
      string,
      { id: string; unitCost: string | null; totalCost: string | null }
    >();

    if (shipmentLinkedItems.length > 0) {
      if (!existing.warehouseId) {
        throw new ConflictException(
          'Sales return has shipment-linked lines but no warehouse recorded',
        );
      }
      const shipmentItems = await this.prisma.shipmentItem.findMany({
        where: {
          id: { in: shipmentLinkedItems.map((item) => item.shipmentItemId!) },
          tenantId: actor.tenantId,
        },
      });
      const shipmentItemsById = new Map(shipmentItems.map((item) => [item.id, item]));
      const inventoryLines = shipmentLinkedItems.map((item) => {
        const shipmentItem = shipmentItemsById.get(item.shipmentItemId!);
        if (!shipmentItem || !shipmentItem.inventoryMovementId) {
          throw new ConflictException(
            'Shipment line is missing its captured inventory movement id',
          );
        }
        return {
          productId: item.productId,
          quantity: quantityToString(item.baseQuantity!),
          originalMovementId: shipmentItem.inventoryMovementId,
        };
      });
      const applyResult = await this.inventory.applyReturn(actor, {
        referenceType: 'sales_return',
        referenceId: existing.id,
        warehouseId: existing.warehouseId,
        lines: inventoryLines,
      });
      movementsByReturnItemId = this.zipMovements(
        shipmentLinkedItems.map((item) => item.id),
        applyResult.movements,
      );
    }

    const confirmed = await this.prisma.$transaction((tx) =>
      this.allocateAndConfirm(tx, actor, id, movementsByReturnItemId),
    );

    await this.audit.record({
      actor,
      action: 'sales-return.confirmed',
      resource: 'sales-return',
      resourceId: confirmed.id,
      metadata: {
        returnNumber: confirmed.returnNumber,
        itemCount: confirmed.items.length,
      },
      request,
    });

    // Post-commit, best-effort (mirrors ShipmentsService/GoodsReceiptsService
    // exactly): confirm() itself is already correct and committed regardless
    // of accounting's availability; only accountingPostingStatus reflects the
    // outcome, retryable via retryAccountingPosting().
    const { salesReturn: finalRow } = await this.attemptReturnPosting(
      actor,
      confirmed,
      request,
    );
    return toSalesReturnResponse(finalRow);
  }

  /**
   * Zips the item ids sent to Inventory (in the exact order the request's
   * `lines` were built) with the `movements[]` array Inventory returns,
   * which is guaranteed to be in that same positional order. Never matched
   * by productId — mirrors GoodsReceiptsService.zipMovementIds() exactly.
   */
  private zipMovements(
    itemIds: string[],
    movements: Array<{ id: string; unitCost: string | null; totalCost: string | null }>,
  ): Map<string, { id: string; unitCost: string | null; totalCost: string | null }> {
    if (movements.length !== itemIds.length) {
      throw new ConflictException(
        'Inventory service returned a different number of movements than lines sent',
      );
    }
    const map = new Map<
      string,
      { id: string; unitCost: string | null; totalCost: string | null }
    >();
    itemIds.forEach((itemId, index) => {
      map.set(itemId, movements[index]);
    });
    return map;
  }

  /**
   * The allocation algorithm for confirm(), entirely inside one transaction.
   * Lock order — sales_returns (single row) -> sales_invoices (single row)
   * -> sales_invoice_items (all rows under the invoice) -> shipment_items
   * (specific rows referenced by this return) — mirrors
   * PurchaseReturnsService's own lock ordering shape. Re-verifies the
   * DRAFT/CONFIRMED state under lock (closing the race window against a
   * concurrent confirm() call for the same return), rather than trusting the
   * caller's soft, pre-transaction read.
   */
  private async allocateAndConfirm(
    tx: Prisma.TransactionClient,
    actor: ActorContext,
    returnId: string,
    movementsByReturnItemId: Map<
      string,
      { id: string; unitCost: string | null; totalCost: string | null }
    >,
  ) {
    const returnRows = await tx.$queryRaw<
      Array<{ id: string; status: string; salesInvoiceId: string }>
    >(
      Prisma.sql`
        SELECT id, status::text AS status, "salesInvoiceId"
        FROM sales_returns
        WHERE id = ${returnId}::uuid AND "tenantId" = ${actor.tenantId}::uuid
        FOR UPDATE
      `,
    );
    const lockedReturn = returnRows[0];
    if (!lockedReturn) throw new NotFoundException('Sales return not found');

    if (lockedReturn.status === SalesReturnStatus.CONFIRMED) {
      return tx.salesReturn.findFirstOrThrow({
        where: { id: returnId, tenantId: actor.tenantId },
        include: RETURN_INCLUDE,
      });
    }
    if (lockedReturn.status !== SalesReturnStatus.DRAFT) {
      throw new ConflictException('Sales return cannot be confirmed');
    }

    await tx.$queryRaw`
      SELECT id FROM sales_invoices
      WHERE id = ${lockedReturn.salesInvoiceId}::uuid AND "tenantId" = ${actor.tenantId}::uuid
      FOR UPDATE
    `;
    await tx.$queryRaw`
      SELECT id FROM sales_invoice_items
      WHERE "salesInvoiceId" = ${lockedReturn.salesInvoiceId}::uuid AND "tenantId" = ${actor.tenantId}::uuid
      FOR UPDATE
    `;

    const salesReturn = await tx.salesReturn.findFirstOrThrow({
      where: { id: returnId, tenantId: actor.tenantId },
      include: RETURN_INCLUDE,
    });
    const invoice = await tx.salesInvoice.findFirstOrThrow({
      where: { id: salesReturn.salesInvoiceId, tenantId: actor.tenantId },
      include: { items: true },
    });
    if (invoice.status !== SalesInvoiceStatus.SENT) {
      // Data-integrity guard — should never trigger under correct operation.
      throw new ConflictException(
        'Only a SENT sales invoice can have a return confirmed against it',
      );
    }

    const shipmentItemIds = salesReturn.items
      .map((item) => item.shipmentItemId)
      .filter((id): id is string => !!id);
    if (shipmentItemIds.length > 0) {
      await tx.$queryRaw(
        Prisma.sql`
          SELECT id FROM shipment_items
          WHERE id IN (${Prisma.join(shipmentItemIds)}) AND "tenantId" = ${actor.tenantId}::uuid
          FOR UPDATE
        `,
      );
    }
    const shipmentItems = shipmentItemIds.length
      ? await tx.shipmentItem.findMany({
          where: { id: { in: shipmentItemIds }, tenantId: actor.tenantId },
        })
      : [];
    const shipmentItemsById = new Map(shipmentItems.map((item) => [item.id, item]));
    const invoiceItemsById = new Map(invoice.items.map((item) => [item.id, item]));

    let amountCreditedDelta = new Prisma.Decimal(0);
    const invoiceItemDeltas = new Map<string, Prisma.Decimal>();
    const shipmentItemDeltas = new Map<string, Prisma.Decimal>();

    for (const item of salesReturn.items) {
      if (item.salesInvoiceItemId) {
        const invoiceItem = invoiceItemsById.get(item.salesInvoiceItemId);
        if (!invoiceItem) {
          throw new ConflictException(
            'Sales invoice item used by this return no longer exists',
          );
        }
        const priorDelta = invoiceItemDeltas.get(invoiceItem.id) ?? new Prisma.Decimal(0);
        const newReturned = invoiceItem.returnedQuantity.plus(priorDelta).plus(item.quantity);
        if (newReturned.gt(invoiceItem.quantity)) {
          throw new ConflictException(
            'Return quantity exceeds the returnable quantity for a sales invoice line',
          );
        }
        invoiceItemDeltas.set(invoiceItem.id, priorDelta.plus(item.quantity));
        amountCreditedDelta = amountCreditedDelta.plus(item.lineTotal ?? new Prisma.Decimal(0));
      }
      if (item.shipmentItemId) {
        const shipmentItem = shipmentItemsById.get(item.shipmentItemId);
        if (!shipmentItem) {
          throw new ConflictException(
            'Shipment item used by this return no longer exists',
          );
        }
        if (!item.baseQuantity) {
          throw new ConflictException('Return line is missing baseQuantity');
        }
        const priorDelta = shipmentItemDeltas.get(shipmentItem.id) ?? new Prisma.Decimal(0);
        const newReturned = shipmentItem.returnedQuantity
          .plus(priorDelta)
          .plus(item.baseQuantity);
        if (newReturned.gt(shipmentItem.baseQuantity ?? new Prisma.Decimal(0))) {
          throw new ConflictException(
            'Return quantity exceeds the returnable quantity for a shipment line',
          );
        }
        shipmentItemDeltas.set(shipmentItem.id, priorDelta.plus(item.baseQuantity));
      }
    }

    for (const [invoiceItemId, delta] of invoiceItemDeltas) {
      const invoiceItem = invoiceItemsById.get(invoiceItemId)!;
      await tx.salesInvoiceItem.update({
        where: { id: invoiceItemId },
        data: { returnedQuantity: invoiceItem.returnedQuantity.plus(delta) },
      });
    }
    if (amountCreditedDelta.gt(0)) {
      await tx.salesInvoice.update({
        where: { id: invoice.id },
        data: { amountCredited: invoice.amountCredited.plus(amountCreditedDelta) },
      });
    }
    for (const [shipmentItemId, delta] of shipmentItemDeltas) {
      const shipmentItem = shipmentItemsById.get(shipmentItemId)!;
      await tx.shipmentItem.update({
        where: { id: shipmentItemId },
        data: { returnedQuantity: shipmentItem.returnedQuantity.plus(delta) },
      });
    }

    for (const item of salesReturn.items) {
      if (!item.shipmentItemId) continue;
      const movement = movementsByReturnItemId.get(item.id);
      if (!movement) continue;
      await tx.salesReturnItem.update({
        where: { id: item.id },
        data: {
          inventoryMovementId: movement.id,
          ...(movement.unitCost
            ? { unitCost: new Prisma.Decimal(movement.unitCost) }
            : {}),
          ...(movement.totalCost
            ? { totalCost: new Prisma.Decimal(movement.totalCost) }
            : {}),
        },
      });
    }

    return tx.salesReturn.update({
      where: { id: returnId },
      data: { status: SalesReturnStatus.CONFIRMED, returnedAt: new Date() },
      include: RETURN_INCLUDE,
    });
  }

  /**
   * Manual retry for a Sales Return whose accounting posting is FAILED (or
   * still NOT_POSTED). Rejected once REVERSED. Already-POSTED is a no-op. A
   * failure here is surfaced to the caller: retrying IS the primary action
   * being requested. Mirrors PurchaseReturnsService.retryAccountingPosting()
   * exactly.
   */
  async retryAccountingPosting(
    actor: ActorContext,
    id: string,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.require(actor, id);
    if (existing.status === SalesReturnStatus.REVERSED) {
      throw new ConflictException(
        'Cannot post accounting for a reversed sales return',
      );
    }
    if (existing.accountingPostingStatus === SalesReturnPostingStatus.POSTED) {
      return toSalesReturnResponse(existing);
    }

    const { salesReturn, error } = await this.attemptReturnPosting(
      actor,
      existing,
      request,
    );
    if (error) throw error;

    await this.audit.record({
      actor,
      action: 'sales-return.accounting-posting-retried',
      resource: 'sales-return',
      resourceId: salesReturn.id,
      metadata: { journalEntryId: salesReturn.journalEntryId },
      request,
    });
    return toSalesReturnResponse(salesReturn);
  }

  /**
   * Phase 3.12 — CONFIRMED -> REVERSED. Undoes a single Sales Return's
   * effect on SalesInvoice.amountCredited/SalesInvoiceItem.returnedQuantity/
   * ShipmentItem.returnedQuantity and (post-commit, best-effort) its posted
   * journal. Idempotent: re-invoking on an already-REVERSED return is a
   * no-op. Mirrors PurchaseReturnsService.reverse() exactly.
   */
  async reverse(
    actor: ActorContext,
    id: string,
    dto: ReverseSalesReturnDto,
    request?: RequestAuditMeta,
  ) {
    const soft = await this.require(actor, id);
    if (soft.status === SalesReturnStatus.REVERSED) {
      return toSalesReturnResponse(soft);
    }
    if (soft.status !== SalesReturnStatus.CONFIRMED) {
      throw new ConflictException('Only a CONFIRMED sales return can be reversed');
    }

    const shipmentLinkedItems = soft.items.filter(
      (item) => item.shipmentItemId && item.baseQuantity,
    );
    if (shipmentLinkedItems.length > 0) {
      if (!soft.warehouseId) {
        throw new ConflictException(
          'Sales return has shipment-linked lines but no warehouse recorded',
        );
      }
      const inventoryLines = shipmentLinkedItems.map((item) => {
        if (!item.inventoryMovementId) {
          throw new ConflictException(
            'Return line is missing its captured inventory movement id and cannot be reversed',
          );
        }
        return {
          productId: item.productId,
          quantity: quantityToString(item.baseQuantity!),
          originalMovementId: item.inventoryMovementId,
        };
      });
      await this.inventory.applyReturn(actor, {
        referenceType: 'sales_return_reversal',
        referenceId: soft.id,
        warehouseId: soft.warehouseId,
        lines: inventoryLines,
      });
    }

    const { salesReturn, alreadyReversed } = await this.prisma.$transaction((tx) =>
      this.restoreAndReverseSalesReturn(tx, actor, id, dto.reason),
    );

    if (alreadyReversed) {
      return toSalesReturnResponse(salesReturn);
    }

    await this.audit.record({
      actor,
      action: 'sales-return.reversed',
      resource: 'sales-return',
      resourceId: salesReturn.id,
      metadata: {
        returnNumber: salesReturn.returnNumber,
        reason: dto.reason?.trim() || null,
      },
      request,
    });

    let finalRow = salesReturn;
    if (
      salesReturn.accountingPostingStatus === SalesReturnPostingStatus.POSTED &&
      salesReturn.journalEntryId
    ) {
      const { salesReturn: reversed } = await this.attemptReturnReversal(
        actor,
        salesReturn,
        request,
      );
      finalRow = reversed;
    }

    return toSalesReturnResponse(finalRow);
  }

  /**
   * The restoration algorithm for reverse(), entirely inside one transaction.
   * Same lock order as allocateAndConfirm(). Re-verifies the CONFIRMED/
   * REVERSED state under lock, restores every counter by reading this
   * return's own persisted item snapshot fields back out and subtracting —
   * never recomputed, mirrors PurchaseReturnsService.restoreAndReverse()'s
   * "read the write-once evidence back out" principle, simplified since
   * SalesReturnItem itself already stores everything needed (no separate
   * allocation table).
   */
  private async restoreAndReverseSalesReturn(
    tx: Prisma.TransactionClient,
    actor: ActorContext,
    returnId: string,
    reason: string | undefined,
  ) {
    const returnRows = await tx.$queryRaw<
      Array<{ id: string; status: string; salesInvoiceId: string }>
    >(
      Prisma.sql`
        SELECT id, status::text AS status, "salesInvoiceId"
        FROM sales_returns
        WHERE id = ${returnId}::uuid AND "tenantId" = ${actor.tenantId}::uuid
        FOR UPDATE
      `,
    );
    const locked = returnRows[0];
    if (!locked) throw new NotFoundException('Sales return not found');

    if (locked.status === SalesReturnStatus.REVERSED) {
      const salesReturn = await tx.salesReturn.findFirstOrThrow({
        where: { id: returnId, tenantId: actor.tenantId },
        include: RETURN_INCLUDE,
      });
      return { salesReturn, alreadyReversed: true as const };
    }
    if (locked.status !== SalesReturnStatus.CONFIRMED) {
      throw new ConflictException('Only a CONFIRMED sales return can be reversed');
    }

    await tx.$queryRaw`
      SELECT id FROM sales_invoices
      WHERE id = ${locked.salesInvoiceId}::uuid AND "tenantId" = ${actor.tenantId}::uuid
      FOR UPDATE
    `;
    await tx.$queryRaw`
      SELECT id FROM sales_invoice_items
      WHERE "salesInvoiceId" = ${locked.salesInvoiceId}::uuid AND "tenantId" = ${actor.tenantId}::uuid
      FOR UPDATE
    `;

    const salesReturn = await tx.salesReturn.findFirstOrThrow({
      where: { id: returnId, tenantId: actor.tenantId },
      include: RETURN_INCLUDE,
    });

    const shipmentItemIds = salesReturn.items
      .map((item) => item.shipmentItemId)
      .filter((id): id is string => !!id);
    if (shipmentItemIds.length > 0) {
      await tx.$queryRaw(
        Prisma.sql`
          SELECT id FROM shipment_items
          WHERE id IN (${Prisma.join(shipmentItemIds)}) AND "tenantId" = ${actor.tenantId}::uuid
          FOR UPDATE
        `,
      );
    }

    let amountCreditedDelta = new Prisma.Decimal(0);
    const invoiceItemDeltas = new Map<string, Prisma.Decimal>();
    const shipmentItemDeltas = new Map<string, Prisma.Decimal>();
    for (const item of salesReturn.items) {
      if (item.salesInvoiceItemId) {
        const prior = invoiceItemDeltas.get(item.salesInvoiceItemId) ?? new Prisma.Decimal(0);
        invoiceItemDeltas.set(item.salesInvoiceItemId, prior.plus(item.quantity));
        amountCreditedDelta = amountCreditedDelta.plus(item.lineTotal ?? new Prisma.Decimal(0));
      }
      if (item.shipmentItemId && item.baseQuantity) {
        const prior = shipmentItemDeltas.get(item.shipmentItemId) ?? new Prisma.Decimal(0);
        shipmentItemDeltas.set(item.shipmentItemId, prior.plus(item.baseQuantity));
      }
    }

    for (const [invoiceItemId, delta] of invoiceItemDeltas) {
      const invoiceItem = await tx.salesInvoiceItem.findFirstOrThrow({
        where: { id: invoiceItemId, tenantId: actor.tenantId },
      });
      const newReturned = invoiceItem.returnedQuantity.minus(delta);
      if (newReturned.lt(0)) {
        // Data-integrity guard — should never trigger under correct operation.
        throw new ConflictException(
          "Reversing this return would drive a sales invoice line's returnedQuantity negative",
        );
      }
      await tx.salesInvoiceItem.update({
        where: { id: invoiceItemId },
        data: { returnedQuantity: newReturned },
      });
    }

    if (amountCreditedDelta.gt(0)) {
      const invoice = await tx.salesInvoice.findFirstOrThrow({
        where: { id: locked.salesInvoiceId, tenantId: actor.tenantId },
      });
      const newAmountCredited = invoice.amountCredited.minus(amountCreditedDelta);
      if (newAmountCredited.lt(0)) {
        throw new ConflictException(
          'Reversing this return would drive amountCredited negative for the sales invoice',
        );
      }
      await tx.salesInvoice.update({
        where: { id: invoice.id },
        data: { amountCredited: newAmountCredited },
      });
    }

    for (const [shipmentItemId, delta] of shipmentItemDeltas) {
      const shipmentItem = await tx.shipmentItem.findFirstOrThrow({
        where: { id: shipmentItemId, tenantId: actor.tenantId },
      });
      const newReturned = shipmentItem.returnedQuantity.minus(delta);
      if (newReturned.lt(0)) {
        throw new ConflictException(
          "Reversing this return would drive a shipment line's returnedQuantity negative",
        );
      }
      await tx.shipmentItem.update({
        where: { id: shipmentItemId },
        data: { returnedQuantity: newReturned },
      });
    }

    const updated = await tx.salesReturn.update({
      where: { id: returnId },
      data: {
        status: SalesReturnStatus.REVERSED,
        reversedAt: new Date(),
        reversalReason: reason?.trim() || null,
      },
      include: RETURN_INCLUDE,
    });
    return { salesReturn: updated, alreadyReversed: false as const };
  }

  /**
   * Manual retry for a REVERSED Sales Return whose accounting reversal
   * (attempted post-commit inside reverse()) failed. Mirrors
   * PurchaseReturnsService.retryAccountingReversal() exactly.
   */
  async retryAccountingReversal(
    actor: ActorContext,
    id: string,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.require(actor, id);
    if (existing.status !== SalesReturnStatus.REVERSED) {
      throw new ConflictException(
        'Only a reversed sales return can have its accounting reversal retried',
      );
    }
    if (existing.accountingPostingStatus === SalesReturnPostingStatus.REVERSED) {
      return toSalesReturnResponse(existing);
    }
    if (
      existing.accountingPostingStatus !== SalesReturnPostingStatus.POSTED ||
      !existing.journalEntryId
    ) {
      throw new ConflictException(
        'This sales return has no posted accounting journal to reverse',
      );
    }

    const { salesReturn, error } = await this.attemptReturnReversal(
      actor,
      existing,
      request,
    );
    if (error) throw error;

    await this.audit.record({
      actor,
      action: 'sales-return.accounting-reversal-retried',
      resource: 'sales-return',
      resourceId: salesReturn.id,
      metadata: { reversalJournalEntryId: salesReturn.reversalJournalEntryId },
      request,
    });
    return toSalesReturnResponse(salesReturn);
  }

  /**
   * Combined commercial (revenue/tax/AR) + inventory (COGS) reversal
   * posting, mirroring the original invoice/shipment postings with sides
   * flipped. Reuses existing roles — no new JournalPostingRole needed. Sums
   * only over lines carrying the relevant reference (invoice-linked lines
   * contribute to the commercial side; shipment-linked lines to the
   * inventory side — a line can contribute to both). Returns null (skip
   * posting entirely) when there is nothing to post.
   */
  private buildReturnPostingRequest(
    salesReturn: ReturnWithItems,
  ): CreateJournalPostingRequest | null {
    let subtotalTotal = new Prisma.Decimal(0);
    let discountTotal = new Prisma.Decimal(0);
    let taxTotal = new Prisma.Decimal(0);
    let arTotal = new Prisma.Decimal(0);
    let inventoryTotal = new Prisma.Decimal(0);

    for (const item of salesReturn.items) {
      if (item.salesInvoiceItemId) {
        subtotalTotal = subtotalTotal.plus(item.lineSubtotal ?? 0);
        discountTotal = discountTotal.plus(item.discountAmount ?? 0);
        taxTotal = taxTotal.plus(item.taxAmount ?? 0);
        arTotal = arTotal.plus(item.lineTotal ?? 0);
      }
      if (item.shipmentItemId && item.totalCost) {
        inventoryTotal = inventoryTotal.plus(item.totalCost);
      }
    }

    const lines: CreateJournalPostingRequest['lines'] = [];
    if (subtotalTotal.gt(0)) {
      lines.push({
        role: 'SALES_REVENUE',
        side: 'DEBIT',
        amount: moneyToString(subtotalTotal),
      });
    }
    if (discountTotal.gt(0)) {
      lines.push({
        role: 'SALES_DISCOUNT',
        side: 'CREDIT',
        amount: moneyToString(discountTotal),
      });
    }
    if (taxTotal.gt(0)) {
      lines.push({
        role: 'OUTPUT_TAX',
        side: 'DEBIT',
        amount: moneyToString(taxTotal),
      });
    }
    if (arTotal.gt(0)) {
      lines.push({
        role: 'ACCOUNTS_RECEIVABLE',
        side: 'CREDIT',
        amount: moneyToString(arTotal),
      });
    }
    if (inventoryTotal.gt(0)) {
      lines.push({
        role: 'INVENTORY_ASSET',
        side: 'DEBIT',
        amount: moneyToString(inventoryTotal),
      });
      lines.push({
        role: 'COGS',
        side: 'CREDIT',
        amount: moneyToString(inventoryTotal),
      });
    }

    if (lines.length === 0) return null;

    return {
      sourceService: ACCOUNTING_SOURCE_SERVICE,
      sourceType: 'SALES_RETURN',
      sourceId: salesReturn.id,
      description: `Sales Return ${salesReturn.returnNumber}`,
      lines,
    };
  }

  /**
   * Attempts to post (or idempotently replay) this return's accounting
   * journal and persists the outcome as a Sales-side cache — never throws:
   * the caller decides whether a failure should be surfaced
   * (retryAccountingPosting does; confirm()'s post-commit call does not).
   * Mirrors PurchaseReturnsService.attemptReturnPosting() exactly.
   */
  private async attemptReturnPosting(
    actor: ActorContext,
    salesReturn: ReturnWithItems,
    request?: RequestAuditMeta,
  ) {
    const postingRequest = this.buildReturnPostingRequest(salesReturn);
    if (!postingRequest) {
      return { salesReturn, error: undefined as unknown };
    }
    try {
      const result = await this.accountingJournal.post(actor, postingRequest);
      const updated = await this.prisma.salesReturn.update({
        where: { id: salesReturn.id },
        data: {
          accountingPostingStatus: SalesReturnPostingStatus.POSTED,
          journalEntryId: result.id,
        },
        include: RETURN_INCLUDE,
      });
      await this.audit.record({
        actor,
        action: 'sales-return.accounting-posted',
        resource: 'sales-return',
        resourceId: salesReturn.id,
        metadata: {
          journalEntryId: result.id,
          idempotentReplay: result.idempotentReplay,
        },
        request,
      });
      return { salesReturn: updated, error: undefined as unknown };
    } catch (error) {
      this.logger.error(
        `Failed to post accounting journal for sales return ${salesReturn.id}`,
        error instanceof Error ? error.stack : undefined,
      );
      try {
        await this.prisma.salesReturn.update({
          where: { id: salesReturn.id },
          data: { accountingPostingStatus: SalesReturnPostingStatus.FAILED },
        });
      } catch (updateError) {
        this.logger.error(
          `Failed to record FAILED accounting posting status for sales return ${salesReturn.id}`,
          updateError instanceof Error ? updateError.stack : undefined,
        );
      }
      const refreshed = await this.require(actor, salesReturn.id);
      return { salesReturn: refreshed, error };
    }
  }

  /**
   * Attempts to reverse (or idempotently replay the reversal of) this
   * return's already-POSTED accounting journal. The original journal entry
   * is never touched — looked up read-only inside accounting-service and
   * stays POSTED permanently (no VOID). On failure, accountingPostingStatus
   * is deliberately left at POSTED. Mirrors
   * PurchaseReturnsService.attemptReturnReversal() exactly.
   */
  private async attemptReturnReversal(
    actor: ActorContext,
    salesReturn: { id: string; returnNumber: string },
    request?: RequestAuditMeta,
  ) {
    try {
      const result = await this.accountingJournal.reverse(actor, {
        sourceService: ACCOUNTING_SOURCE_SERVICE,
        sourceType: 'SALES_RETURN',
        sourceId: salesReturn.id,
        reversalSourceType: 'SALES_RETURN_REVERSAL',
        description: `Reversal of sales return ${salesReturn.returnNumber}`,
      });
      const updated = await this.prisma.salesReturn.update({
        where: { id: salesReturn.id },
        data: {
          accountingPostingStatus: SalesReturnPostingStatus.REVERSED,
          reversalJournalEntryId: result.id,
        },
        include: RETURN_INCLUDE,
      });
      await this.audit.record({
        actor,
        action: 'sales-return.accounting-reversed',
        resource: 'sales-return',
        resourceId: salesReturn.id,
        metadata: {
          reversalJournalEntryId: result.id,
          idempotentReplay: result.idempotentReplay,
        },
        request,
      });
      return { salesReturn: updated, error: undefined as unknown };
    } catch (error) {
      this.logger.error(
        `Failed to reverse accounting journal for reversed sales return ${salesReturn.id}`,
        error instanceof Error ? error.stack : undefined,
      );
      const refreshed = await this.require(actor, salesReturn.id);
      return { salesReturn: refreshed, error };
    }
  }

  private async nextReturnNumber(tenantId: string): Promise<string> {
    const count = await this.prisma.salesReturn.count({ where: { tenantId } });
    return `SRET-${String(count + 1).padStart(8, '0')}`;
  }

  private async require(actor: ActorContext, id: string) {
    const row = await this.prisma.salesReturn.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: RETURN_INCLUDE,
    });
    if (!row) throw new NotFoundException('Sales return not found');
    return row;
  }

  async list(actor: ActorContext) {
    const rows = await this.prisma.salesReturn.findMany({
      where: { tenantId: actor.tenantId },
      include: RETURN_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return { items: rows.map(toSalesReturnResponse) };
  }

  async getById(actor: ActorContext, id: string) {
    const row = await this.require(actor, id);
    return toSalesReturnResponse(row);
  }
}
