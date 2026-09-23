import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  Prisma,
  SalesOrderStatus,
  ShipmentPostingStatus,
  ShipmentStatus,
} from '../../generated/prisma-client';
import {
  AccountingJournalClient,
  CreateJournalPostingRequest,
} from '../accounting/accounting-journal.client';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { ActorContext, RequestAuditMeta } from '../auth/actor-context';
import {
  moneyToString,
  parseConversionFactor,
  parsePositiveDecimal,
  quantityToString,
} from '../common/decimal';
import { InventoryProductClient } from '../inventory/inventory-product.client';
import {
  InventoryStockClient,
  InventoryStockIssueMovement,
} from '../inventory/inventory-stock.client';
import { PrismaService } from '../prisma/prisma.service';
import { toShipmentResponse } from './dto/shipment-response';
import { CreateShipmentDto, ResolveShipmentLineConversionDto } from './dto/shipment.dto';

const SHIPMENT_INCLUDE = {
  items: { orderBy: { createdAt: 'asc' as const } },
};

const SHIPMENT_WITH_ORDER_INCLUDE = {
  ...SHIPMENT_INCLUDE,
  salesOrder: { include: { items: true } },
};

const ACCOUNTING_SOURCE_SERVICE = 'sales-service';

type SalesOrderItemRow = {
  id: string;
  unitOfMeasureId: string | null;
  uomCode: string | null;
  uomName: string | null;
  conversionFactor: Prisma.Decimal | null;
  productTracksInventory: boolean | null;
};

type ShipmentItemRow = {
  id: string;
  salesOrderItemId: string;
  productId: string;
  quantity: Prisma.Decimal;
  baseQuantity: Prisma.Decimal | null;
};

// Phase 3.3 (Sales Shipment COGS) — the authoritative per-line cost
// returned by Inventory's issue call, keyed by ShipmentItem.id so it can be
// persisted onto the right row inside finalizePosted()'s own transaction.
// Never recomputed by Sales — this is exactly what Inventory returned.
type CostsByShipmentItemId = Map<
  string,
  { unitCost: Prisma.Decimal; totalCost: Prisma.Decimal }
>;

/** Minimal shape needed to build a Shipment's COGS accounting posting request. */
interface CogsPostingSource {
  id: string;
  items: Array<{
    productTracksInventory: boolean | null;
    totalCost: Prisma.Decimal | null;
  }>;
}

/**
 * A line is already resolved (baseQuantity persisted — new shipment, or a
 * previously-resolved legacy line); safely resolvable (legacy line whose
 * SalesOrderItem carries a valid historical UOM snapshot, or legitimately
 * has none at all — meaning it was always base-UOM); or unresolvable
 * (SalesOrderItem missing, or carries a UOM id with no usable
 * conversionFactor — genuinely inconsistent historical data). Never a
 * default/guess (Inventory Design v4, Sales Shipment UOM Phase A, §5).
 */
type LineResolution =
  | { kind: 'resolved'; baseQuantity: Prisma.Decimal }
  | {
      kind: 'resolvable';
      conversionFactor: Prisma.Decimal;
      unitOfMeasureId: string | null;
      uomCode: string | null;
      uomName: string | null;
      baseQuantity: Prisma.Decimal;
    }
  | { kind: 'unresolvable' };

function classifyLine(
  item: ShipmentItemRow,
  soItem: SalesOrderItemRow | undefined,
): LineResolution {
  if (item.baseQuantity !== null) {
    return { kind: 'resolved', baseQuantity: item.baseQuantity };
  }
  if (!soItem) {
    return { kind: 'unresolvable' };
  }
  if (soItem.unitOfMeasureId === null) {
    // No UOM was ever captured for this order line — it was always ordered
    // in the base unit, so conversionFactor = 1 is a recorded fact, not a
    // guess (mirrors Purchase's identical convention).
    return {
      kind: 'resolvable',
      conversionFactor: new Prisma.Decimal(1),
      unitOfMeasureId: null,
      uomCode: null,
      uomName: null,
      baseQuantity: item.quantity,
    };
  }
  if (!soItem.conversionFactor || soItem.conversionFactor.lte(0)) {
    // UOM id present but no usable conversion factor — genuinely
    // inconsistent historical data. Do not default to 1, do not guess.
    return { kind: 'unresolvable' };
  }
  return {
    kind: 'resolvable',
    conversionFactor: soItem.conversionFactor,
    unitOfMeasureId: soItem.unitOfMeasureId,
    uomCode: soItem.uomCode,
    uomName: soItem.uomName,
    baseQuantity: item.quantity.mul(soItem.conversionFactor),
  };
}

@Injectable()
export class ShipmentsService {
  private readonly logger = new Logger(ShipmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryStockClient,
    private readonly inventoryProducts: InventoryProductClient,
    private readonly audit: IdentityAuditClient,
    private readonly accountingJournal: AccountingJournalClient,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreateShipmentDto,
    request?: RequestAuditMeta,
  ) {
    const shipmentId = randomUUID();
    const prepared = await this.preparePendingShipment(
      actor,
      shipmentId,
      dto,
    );
    await this.audit.record({
      actor,
      action: 'shipment.created',
      resource: 'shipment',
      resourceId: shipmentId,
      metadata: {
        salesOrderId: dto.salesOrderId,
        warehouseId: dto.warehouseId,
        itemCount: prepared.inventoryLines.length,
        status: ShipmentStatus.PENDING_STOCK,
      },
      request,
    });
    const issueResult = await this.inventory.applyIssue(actor, {
      referenceType: 'shipment',
      referenceId: shipmentId,
      warehouseId: dto.warehouseId,
      lines: prepared.inventoryLines.map(({ productId, quantity }) => ({
        productId,
        quantity,
      })),
    });
    const costsByItemId = this.buildCostsByItemId(
      prepared.inventoryLines,
      issueResult.movements,
    );
    const posted = await this.finalizePosted(
      actor,
      shipmentId,
      request,
      costsByItemId,
    );
    // Post-commit, best-effort (Phase 3.3): accounting-service is a
    // separate database, so this is never attempted inside finalizePosted()'s
    // own transaction. A failure here never fails create() itself — the
    // shipment is already, correctly, POSTED regardless of accounting's
    // availability; only accountingPostingStatus reflects the outcome,
    // retryable via retryAccountingPosting().
    const { shipment: finalRow } = await this.attemptCogsPosting(
      actor,
      posted,
      request,
    );
    return toShipmentResponse(finalRow);
  }

  async post(
    actor: ActorContext,
    id: string,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.prisma.shipment.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: SHIPMENT_WITH_ORDER_INCLUDE,
    });
    if (!existing) throw new NotFoundException('Shipment not found');
    if (existing.status === ShipmentStatus.POSTED) {
      return toShipmentResponse(existing);
    }
    if (existing.status !== ShipmentStatus.PENDING_STOCK) {
      throw new ConflictException('Shipment cannot be posted');
    }

    const inventoryLines = await this.resolveInventoryLines(
      actor,
      existing,
    );

    const issueResult = await this.inventory.applyIssue(actor, {
      referenceType: 'shipment',
      referenceId: existing.id,
      warehouseId: existing.warehouseId,
      lines: inventoryLines.map(({ productId, quantity }) => ({
        productId,
        quantity,
      })),
    });
    const costsByItemId = this.buildCostsByItemId(
      inventoryLines,
      issueResult.movements,
    );
    const posted = await this.finalizePosted(
      actor,
      existing.id,
      request,
      costsByItemId,
    );
    const { shipment: finalRow } = await this.attemptCogsPosting(
      actor,
      posted,
      request,
    );
    return toShipmentResponse(finalRow);
  }

  /**
   * Resolves every line's baseQuantity for the Inventory call. Already-
   * resolved lines (post-Phase-A shipments, or previously-resolved legacy
   * lines) are used as-is, never recomputed. A legacy pre-fix line with a
   * safely recoverable historical UOM snapshot is computed and persisted
   * here, before the Inventory call, so a later retry reuses the persisted
   * value rather than recomputing (Phase A §5-B). If any line cannot be
   * safely resolved, the whole shipment is blocked into
   * UOM_RESOLUTION_REQUIRED and Inventory is never called (Phase A §5-C) —
   * no partial application.
   */
  private async resolveInventoryLines(
    actor: ActorContext,
    existing: {
      id: string;
      items: ShipmentItemRow[];
      salesOrder: { items: SalesOrderItemRow[] };
    },
  ): Promise<Array<{ shipmentItemId: string; productId: string; quantity: string }>> {
    const soItemsById = new Map(
      existing.salesOrder.items.map((item) => [item.id, item]),
    );
    const classifications = existing.items.map((item) => ({
      item,
      resolution: classifyLine(item, soItemsById.get(item.salesOrderItemId)),
    }));

    const unresolvable = classifications.filter(
      (c) => c.resolution.kind === 'unresolvable',
    );
    if (unresolvable.length > 0) {
      await this.prisma.shipment.update({
        where: { id: existing.id },
        data: { status: ShipmentStatus.UOM_RESOLUTION_REQUIRED },
      });
      throw new ConflictException({
        code: 'SHIPMENT_CONVERSION_UNRESOLVED',
        message:
          'Shipment cannot be posted: one or more lines have no recoverable historical unit-of-measure conversion and require manual resolution',
        details: unresolvable.map(({ item }) => ({
          shipmentItemId: item.id,
        })),
      });
    }

    const toPersist = classifications.filter(
      (c) => c.resolution.kind === 'resolvable',
    ) as Array<{
      item: ShipmentItemRow;
      resolution: Extract<LineResolution, { kind: 'resolvable' }>;
    }>;
    if (toPersist.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        for (const { item, resolution } of toPersist) {
          await tx.shipmentItem.update({
            where: { id: item.id },
            data: {
              unitOfMeasureId: resolution.unitOfMeasureId,
              uomCode: resolution.uomCode,
              uomName: resolution.uomName,
              conversionFactor: resolution.conversionFactor,
              baseQuantity: resolution.baseQuantity,
            },
          });
        }
      });
    }

    return classifications.map(({ item, resolution }) => ({
      shipmentItemId: item.id,
      productId: item.productId,
      quantity: quantityToString(
        resolution.kind === 'unresolvable' ? item.quantity : resolution.baseQuantity,
      ),
    }));
  }

  /**
   * Manually resolves a blocked legacy ShipmentItem line (Phase A §5-C,
   * §11) — a deliberate, audited human decision using the UOM's CURRENT
   * ProductUnit conversion, since no historical value is recoverable for
   * this branch by definition. Once every line on the shipment is resolved,
   * the shipment returns to PENDING_STOCK so post()/retry can proceed
   * normally.
   */
  async resolveConversion(
    actor: ActorContext,
    shipmentId: string,
    lineId: string,
    dto: ResolveShipmentLineConversionDto,
    request?: RequestAuditMeta,
  ) {
    const shipment = await this.prisma.shipment.findFirst({
      where: { id: shipmentId, tenantId: actor.tenantId },
      include: SHIPMENT_WITH_ORDER_INCLUDE,
    });
    if (!shipment) throw new NotFoundException('Shipment not found');
    if (shipment.status !== ShipmentStatus.UOM_RESOLUTION_REQUIRED) {
      throw new ConflictException(
        'Shipment is not awaiting manual UOM resolution',
      );
    }
    const line = shipment.items.find((item) => item.id === lineId);
    if (!line) throw new NotFoundException('Shipment line not found');
    if (line.baseQuantity !== null) {
      throw new ConflictException('Shipment line is already resolved');
    }

    const uomOptions = await this.inventoryProducts.getUomOptions(
      actor,
      line.productId,
    );
    let unitOfMeasureId: string;
    let uomCode: string;
    let uomName: string;
    let conversionFactor: Prisma.Decimal;
    if (dto.unitOfMeasureId === uomOptions.base.unitOfMeasureId) {
      unitOfMeasureId = uomOptions.base.unitOfMeasureId;
      uomCode = uomOptions.base.code;
      uomName = uomOptions.base.name;
      conversionFactor = new Prisma.Decimal(1);
    } else {
      const alt = uomOptions.alternatives.find(
        (option) => option.unitOfMeasureId === dto.unitOfMeasureId,
      );
      if (!alt) {
        // Covers "belongs to another product", "belongs to another tenant"
        // (uom-options is already tenant+product scoped, so neither can
        // ever appear here), and "does not exist at all" — Sales has no
        // way to distinguish these cases from this product-scoped
        // response, so all three are rejected identically rather than
        // fabricating a distinction it cannot actually verify.
        throw new ConflictException({
          code: 'SHIPMENT_UOM_INVALID_FOR_PRODUCT',
          message:
            'The selected unit of measure is not valid for this line\'s product',
        });
      }
      const factor = new Prisma.Decimal(alt.conversionFactor);
      if (factor.lte(0)) {
        throw new ConflictException({
          code: 'SHIPMENT_UOM_INVALID_CONVERSION_FACTOR',
          message: 'The selected unit of measure has no positive conversion factor',
        });
      }
      unitOfMeasureId = alt.unitOfMeasureId;
      uomCode = alt.code;
      uomName = alt.name;
      conversionFactor = factor;
    }

    const baseQuantity = line.quantity.mul(conversionFactor);
    await this.prisma.shipmentItem.update({
      where: { id: line.id },
      data: {
        unitOfMeasureId,
        uomCode,
        uomName,
        conversionFactor,
        baseQuantity,
        conversionResolvedBy: actor.userId,
        conversionResolvedAt: new Date(),
        conversionResolutionNote: dto.note ?? null,
      },
    });

    const stillUnresolved = shipment.items.some((item) => {
      if (item.id === line.id) return false;
      if (item.baseQuantity !== null) return false;
      const soItem = shipment.salesOrder.items.find(
        (row) => row.id === item.salesOrderItemId,
      );
      return classifyLine(item, soItem).kind !== 'resolvable';
    });
    const updated = await this.prisma.shipment.update({
      where: { id: shipment.id },
      data: stillUnresolved
        ? {}
        : { status: ShipmentStatus.PENDING_STOCK },
      include: SHIPMENT_INCLUDE,
    });

    await this.audit.record({
      actor,
      action: 'shipment.conversion_resolved',
      resource: 'shipment',
      resourceId: shipment.id,
      metadata: {
        shipmentItemId: line.id,
        unitOfMeasureId,
        conversionFactor: conversionFactor.toString(),
        shipmentStatus: updated.status,
      },
      request,
    });

    return toShipmentResponse(updated);
  }

  async list(actor: ActorContext) {
    const rows = await this.prisma.shipment.findMany({
      where: { tenantId: actor.tenantId },
      include: SHIPMENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return { items: rows.map(toShipmentResponse) };
  }

  async getById(actor: ActorContext, id: string) {
    const row = await this.prisma.shipment.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: SHIPMENT_INCLUDE,
    });
    if (!row) throw new NotFoundException('Shipment not found');
    return toShipmentResponse(row);
  }

  private async preparePendingShipment(
    actor: ActorContext,
    shipmentId: string,
    dto: CreateShipmentDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const orderRows = await tx.$queryRaw<Array<{ id: string; status: string }>>(
        Prisma.sql`
          SELECT id, status::text AS status
          FROM sales_orders
          WHERE id = ${dto.salesOrderId}::uuid AND "tenantId" = ${actor.tenantId}::uuid
          FOR UPDATE
        `,
      );
      const orderLock = orderRows[0];
      if (!orderLock) throw new NotFoundException('Sales order not found');
      if (
        orderLock.status !== SalesOrderStatus.CONFIRMED &&
        orderLock.status !== SalesOrderStatus.PARTIALLY_FULFILLED
      ) {
        throw new ConflictException(
          'Sales order is not open for shipment',
        );
      }

      const order = await tx.salesOrder.findFirst({
        where: { id: dto.salesOrderId, tenantId: actor.tenantId },
        include: { items: true },
      });
      if (!order) throw new NotFoundException('Sales order not found');

      await tx.$queryRaw`
        SELECT id FROM sales_order_items
        WHERE "salesOrderId" = ${order.id}::uuid
          AND "tenantId" = ${actor.tenantId}::uuid
        FOR UPDATE
      `;

      const pendingByItem = await this.pendingQuantitiesByOrderItem(
        tx,
        actor.tenantId,
        order.id,
      );

      const itemsById = new Map(order.items.map((item) => [item.id, item]));
      const shipmentItems: Array<{
        // Phase 3.3 (Sales Shipment COGS) — pre-generated, exactly like the
        // shipment's own id, so the caller can correlate Inventory's
        // per-line issue response back to this specific ShipmentItem row
        // (both arrays are built from/consumed in the same order in the
        // same function call — never relies on a later DB re-fetch order).
        id: string;
        salesOrderItemId: string;
        productId: string;
        productSku: string;
        productName: string;
        quantity: Prisma.Decimal;
        unitOfMeasureId: string | null;
        uomCode: string | null;
        uomName: string | null;
        conversionFactor: Prisma.Decimal;
        baseQuantity: Prisma.Decimal;
      }> = [];

      for (const line of dto.items) {
        const soItem = itemsById.get(line.salesOrderItemId);
        if (!soItem || soItem.tenantId !== actor.tenantId) {
          throw new NotFoundException('Sales order item not found');
        }
        const qty = parsePositiveDecimal(line.quantity);
        const pending = pendingByItem.get(soItem.id) ?? new Prisma.Decimal(0);
        const remaining = soItem.quantity
          .minus(soItem.shippedQuantity)
          .minus(pending);
        if (qty.gt(remaining)) {
          throw new ConflictException(
            'Shipment quantity exceeds remaining ordered quantity',
          );
        }
        // baseQuantity is derived once here, at creation, exactly as
        // GoodsReceiptItem.baseQuantity is for Purchase — never re-resolved
        // from current ProductUnit config on a later retry (Phase A §5/§8).
        const conversionFactor = soItem.unitOfMeasureId
          ? parseConversionFactor(soItem.conversionFactor)
          : new Prisma.Decimal(1);
        shipmentItems.push({
          id: randomUUID(),
          salesOrderItemId: soItem.id,
          productId: soItem.productId,
          productSku: soItem.productSku,
          productName: soItem.productName,
          quantity: qty,
          unitOfMeasureId: soItem.unitOfMeasureId,
          uomCode: soItem.uomCode,
          uomName: soItem.uomName,
          conversionFactor,
          baseQuantity: qty.mul(conversionFactor),
        });
        pendingByItem.set(soItem.id, pending.plus(qty));
      }

      await tx.shipment.create({
        data: {
          id: shipmentId,
          tenantId: actor.tenantId,
          salesOrderId: order.id,
          warehouseId: dto.warehouseId,
          status: ShipmentStatus.PENDING_STOCK,
          items: {
            create: shipmentItems.map((item) => ({
              id: item.id,
              tenantId: actor.tenantId,
              salesOrderItemId: item.salesOrderItemId,
              productId: item.productId,
              productSku: item.productSku,
              productName: item.productName,
              quantity: item.quantity,
              unitOfMeasureId: item.unitOfMeasureId,
              uomCode: item.uomCode,
              uomName: item.uomName,
              conversionFactor: item.conversionFactor,
              baseQuantity: item.baseQuantity,
            })),
          },
        },
      });

      return {
        // baseQuantity — never quantity — is the only value ever sent to
        // Inventory (Phase A §8). shipmentItemId travels alongside it
        // purely for this process's own later cost-correlation step — it is
        // stripped before the actual HTTP payload (see create()).
        inventoryLines: shipmentItems.map((item) => ({
          shipmentItemId: item.id,
          productId: item.productId,
          quantity: quantityToString(item.baseQuantity),
        })),
      };
    });
  }

  private async finalizePosted(
    actor: ActorContext,
    shipmentId: string,
    request?: RequestAuditMeta,
    costsByItemId?: CostsByShipmentItemId,
  ) {
    const posted = await this.prisma.$transaction(async (tx) => {
      const shipmentRows = await tx.$queryRaw<
        Array<{ id: string; status: string; salesOrderId: string }>
      >(
        Prisma.sql`
          SELECT id, status::text AS status, "salesOrderId"
          FROM shipments
          WHERE id = ${shipmentId}::uuid AND "tenantId" = ${actor.tenantId}::uuid
          FOR UPDATE
        `,
      );
      const locked = shipmentRows[0];
      if (!locked) throw new NotFoundException('Shipment not found');
      if (locked.status === ShipmentStatus.POSTED) {
        return tx.shipment.findFirstOrThrow({
          where: { id: shipmentId, tenantId: actor.tenantId },
          include: SHIPMENT_INCLUDE,
        });
      }
      if (locked.status !== ShipmentStatus.PENDING_STOCK) {
        throw new ConflictException('Shipment cannot be finalized');
      }

      await tx.$queryRaw`
        SELECT id FROM sales_orders
        WHERE id = ${locked.salesOrderId}::uuid AND "tenantId" = ${actor.tenantId}::uuid
        FOR UPDATE
      `;

      const shipment = await tx.shipment.findFirstOrThrow({
        where: { id: shipmentId, tenantId: actor.tenantId },
        include: {
          ...SHIPMENT_INCLUDE,
          salesOrder: { include: { items: true } },
        },
      });

      await tx.$queryRaw`
        SELECT id FROM sales_order_items
        WHERE "salesOrderId" = ${shipment.salesOrderId}::uuid
          AND "tenantId" = ${actor.tenantId}::uuid
        FOR UPDATE
      `;

      for (const item of shipment.items) {
        const soItem = shipment.salesOrder.items.find(
          (row) => row.id === item.salesOrderItemId,
        );
        if (!soItem) {
          throw new ConflictException('Sales order item missing');
        }
        const nextShipped = soItem.shippedQuantity.plus(item.quantity);
        if (nextShipped.gt(soItem.quantity)) {
          throw new ConflictException(
            'Shipment quantity exceeds remaining ordered quantity',
          );
        }
        await tx.salesOrderItem.update({
          where: { id: soItem.id },
          data: { shippedQuantity: nextShipped },
        });

        // Phase 3.3 (Sales Shipment COGS) — persist the authoritative
        // issue-time cost (from Inventory's response, never recomputed
        // here) onto this ShipmentItem, in the same transaction that
        // commits the shipment as POSTED. Copies productTracksInventory
        // forward from the SalesOrderItem at the same time — the ONLY
        // place this snapshot is ever written for a ShipmentItem.
        const cost = costsByItemId?.get(item.id);
        await tx.shipmentItem.update({
          where: { id: item.id },
          data: {
            productTracksInventory: soItem.productTracksInventory,
            ...(cost
              ? { unitCost: cost.unitCost, totalCost: cost.totalCost }
              : {}),
          },
        });
      }

      const refreshedItems = await tx.salesOrderItem.findMany({
        where: {
          salesOrderId: shipment.salesOrderId,
          tenantId: actor.tenantId,
        },
      });
      const fullyShipped = refreshedItems.every((item) =>
        item.shippedQuantity.eq(item.quantity),
      );
      await tx.salesOrder.update({
        where: { id: shipment.salesOrderId },
        data: {
          status: fullyShipped
            ? SalesOrderStatus.FULFILLED
            : SalesOrderStatus.PARTIALLY_FULFILLED,
        },
      });

      return tx.shipment.update({
        where: { id: shipment.id },
        data: {
          status: ShipmentStatus.POSTED,
          shippedAt: new Date(),
        },
        include: SHIPMENT_INCLUDE,
      });
    });

    await this.audit.record({
      actor,
      action: 'shipment.posted',
      resource: 'shipment',
      resourceId: posted.id,
      metadata: {
        salesOrderId: posted.salesOrderId,
        warehouseId: posted.warehouseId,
        itemCount: posted.items.length,
      },
      request,
    });
    // Returns the raw row (not toShipmentResponse()) — the caller still
    // needs to run attemptCogsPosting() and reflect its outcome before
    // shaping the final API response (mirrors GoodsReceiptsService's
    // finalizePosted() -> attemptGrniPosting() ordering exactly).
    return posted;
  }

  private async pendingQuantitiesByOrderItem(
    tx: Prisma.TransactionClient,
    tenantId: string,
    salesOrderId: string,
  ): Promise<Map<string, Prisma.Decimal>> {
    const pending = await tx.shipmentItem.findMany({
      where: {
        tenantId,
        shipment: {
          salesOrderId,
          tenantId,
          status: ShipmentStatus.PENDING_STOCK,
        },
      },
    });
    const map = new Map<string, Prisma.Decimal>();
    for (const item of pending) {
      const current = map.get(item.salesOrderItemId) ?? new Prisma.Decimal(0);
      map.set(item.salesOrderItemId, current.plus(item.quantity));
    }
    return map;
  }

  /**
   * Phase 3.3 (Sales Shipment COGS) — zips the local, ordered
   * `{ shipmentItemId, productId, quantity }` array (exactly what was sent
   * to Inventory, in the same order) against Inventory's `movements`
   * response (returned strictly 1:1, in that same order, per
   * StockIssuesService's implementation) into a lookup by ShipmentItem id.
   * Never reads `productId` to correlate — a shipment can legitimately have
   * two lines for the same product, and only positional correspondence is
   * guaranteed to be correct in that case. A length mismatch is treated as
   * an internal invariant violation, never silently mis-mapped.
   */
  private buildCostsByItemId(
    sentLines: Array<{ shipmentItemId: string; productId: string; quantity: string }>,
    movements: InventoryStockIssueMovement[],
  ): CostsByShipmentItemId {
    if (movements.length !== sentLines.length) {
      throw new InternalServerErrorException(
        'Inventory issue response line count does not match the request',
      );
    }
    const map: CostsByShipmentItemId = new Map();
    sentLines.forEach((line, index) => {
      const movement = movements[index];
      map.set(line.shipmentItemId, {
        unitCost: new Prisma.Decimal(movement.unitCost ?? 0),
        totalCost: new Prisma.Decimal(movement.totalCost ?? 0),
      });
    });
    return map;
  }

  /**
   * Phase 3.3 (Sales Shipment COGS). Sums ShipmentItem.totalCost only over
   * lines where productTracksInventory === true (NULL/false lines — including
   * every historical pre-Phase-3.3 row — contribute nothing: Sales has no
   * pre-existing "expense on issue" concept to fall back to, unlike
   * Purchase's PURCHASE_EXPENSE). Returns null (skip posting entirely) when
   * there is nothing to post, mirroring
   * GoodsReceiptsService.buildGrniPostingRequest()'s `total.lte(0) -> null`
   * rule exactly.
   */
  private buildCogsPostingRequest(
    shipment: CogsPostingSource,
  ): CreateJournalPostingRequest | null {
    let total = new Prisma.Decimal(0);
    for (const item of shipment.items) {
      if (item.productTracksInventory !== true) continue;
      if (!item.totalCost) continue;
      total = total.plus(item.totalCost);
    }
    if (total.lte(0)) return null;

    return {
      sourceService: ACCOUNTING_SOURCE_SERVICE,
      sourceType: 'SHIPMENT',
      sourceId: shipment.id,
      description: `Shipment ${shipment.id}`,
      lines: [
        { role: 'COGS', side: 'DEBIT', amount: moneyToString(total) },
        { role: 'INVENTORY_ASSET', side: 'CREDIT', amount: moneyToString(total) },
      ],
    };
  }

  /**
   * Attempts to post (or idempotently replay) this shipment's COGS
   * accounting journal and persists the outcome as a Sales-side cache —
   * never throws: the caller decides whether a failure should be surfaced
   * (retryAccountingPosting does; create()/post()'s post-commit call does
   * not). Mirrors GoodsReceiptsService.attemptGrniPosting() exactly.
   */
  private async attemptCogsPosting(
    actor: ActorContext,
    shipment: Awaited<ReturnType<typeof this.finalizePosted>>,
    request?: RequestAuditMeta,
  ) {
    const postingRequest = this.buildCogsPostingRequest(shipment);
    if (!postingRequest) {
      // Nothing postable (no inventory-tracked line, or every tracked
      // line's totalCost was 0) — nothing was written, so the shipment
      // already in hand is accurate; accountingPostingStatus stays
      // NOT_POSTED at its default.
      return { shipment, error: undefined as unknown };
    }
    try {
      const result = await this.accountingJournal.post(actor, postingRequest);
      const updated = await this.prisma.shipment.update({
        where: { id: shipment.id },
        data: {
          accountingPostingStatus: ShipmentPostingStatus.POSTED,
          journalEntryId: result.id,
        },
        include: SHIPMENT_INCLUDE,
      });
      await this.audit.record({
        actor,
        action: 'shipment.accounting-posted',
        resource: 'shipment',
        resourceId: shipment.id,
        metadata: {
          journalEntryId: result.id,
          idempotentReplay: result.idempotentReplay,
        },
        request,
      });
      return { shipment: updated, error: undefined as unknown };
    } catch (error) {
      this.logger.error(
        `Failed to post COGS accounting journal for shipment ${shipment.id}`,
        error instanceof Error ? error.stack : undefined,
      );
      try {
        await this.prisma.shipment.update({
          where: { id: shipment.id },
          data: { accountingPostingStatus: ShipmentPostingStatus.FAILED },
        });
      } catch (updateError) {
        this.logger.error(
          `Failed to record FAILED accounting posting status for shipment ${shipment.id}`,
          updateError instanceof Error ? updateError.stack : undefined,
        );
      }
      const refreshed = await this.require(actor, shipment.id);
      return { shipment: refreshed, error };
    }
  }

  private async require(actor: ActorContext, id: string) {
    const row = await this.prisma.shipment.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: SHIPMENT_INCLUDE,
    });
    if (!row) throw new NotFoundException('Shipment not found');
    return row;
  }

  /**
   * Manual retry for a POSTED shipment whose COGS accounting posting is
   * currently FAILED (or was never attempted). Rejected for a non-POSTED
   * shipment — nothing to account for until Inventory has actually issued
   * the stock. Already-POSTED accounting is a no-op (never calls
   * accounting-service again) rather than an error. Unlike create()/post()'s
   * post-commit best-effort call, a failure here is surfaced to the caller:
   * retrying IS the primary action being requested. Mirrors
   * GoodsReceiptsService.retryAccountingPosting() exactly.
   */
  async retryAccountingPosting(
    actor: ActorContext,
    id: string,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.require(actor, id);

    if (existing.status !== ShipmentStatus.POSTED) {
      throw new ConflictException(
        'Only a POSTED shipment can have its accounting posting retried',
      );
    }

    if (existing.accountingPostingStatus === ShipmentPostingStatus.POSTED) {
      return toShipmentResponse(existing);
    }

    const { shipment, error } = await this.attemptCogsPosting(
      actor,
      existing,
      request,
    );
    if (error) {
      throw error;
    }

    await this.audit.record({
      actor,
      action: 'shipment.accounting-posting-retried',
      resource: 'shipment',
      resourceId: shipment.id,
      metadata: { journalEntryId: shipment.journalEntryId },
      request,
    });

    return toShipmentResponse(shipment);
  }
}
