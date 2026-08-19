import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  Prisma,
  SalesOrderStatus,
  ShipmentStatus,
} from '../../generated/prisma-client';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { ActorContext, RequestAuditMeta } from '../auth/actor-context';
import {
  parsePositiveDecimal,
  quantityToString,
} from '../common/decimal';
import { InventoryStockClient } from '../inventory/inventory-stock.client';
import { PrismaService } from '../prisma/prisma.service';
import { toShipmentResponse } from './dto/shipment-response';
import { CreateShipmentDto } from './dto/shipment.dto';

const SHIPMENT_INCLUDE = {
  items: { orderBy: { createdAt: 'asc' as const } },
};

@Injectable()
export class ShipmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryStockClient,
    private readonly audit: IdentityAuditClient,
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
    await this.inventory.applyIssue(actor, {
      referenceType: 'shipment',
      referenceId: shipmentId,
      warehouseId: dto.warehouseId,
      lines: prepared.inventoryLines,
    });
    return this.finalizePosted(actor, shipmentId, request);
  }

  async post(
    actor: ActorContext,
    id: string,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.prisma.shipment.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: {
        ...SHIPMENT_INCLUDE,
        salesOrder: { include: { items: true } },
      },
    });
    if (!existing) throw new NotFoundException('Shipment not found');
    if (existing.status === ShipmentStatus.POSTED) {
      return toShipmentResponse(existing);
    }
    if (existing.status !== ShipmentStatus.PENDING_STOCK) {
      throw new ConflictException('Shipment cannot be posted');
    }

    const inventoryLines = existing.items.map((item) => ({
      productId: item.productId,
      quantity: quantityToString(item.quantity),
    }));

    await this.inventory.applyIssue(actor, {
      referenceType: 'shipment',
      referenceId: existing.id,
      warehouseId: existing.warehouseId,
      lines: inventoryLines,
    });
    return this.finalizePosted(actor, existing.id, request);
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
        salesOrderItemId: string;
        productId: string;
        productSku: string;
        productName: string;
        quantity: Prisma.Decimal;
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
        shipmentItems.push({
          salesOrderItemId: soItem.id,
          productId: soItem.productId,
          productSku: soItem.productSku,
          productName: soItem.productName,
          quantity: qty,
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
              tenantId: actor.tenantId,
              salesOrderItemId: item.salesOrderItemId,
              productId: item.productId,
              productSku: item.productSku,
              productName: item.productName,
              quantity: item.quantity,
            })),
          },
        },
      });

      return {
        inventoryLines: shipmentItems.map((item) => ({
          productId: item.productId,
          quantity: quantityToString(item.quantity),
        })),
      };
    });
  }

  private async finalizePosted(
    actor: ActorContext,
    shipmentId: string,
    request?: RequestAuditMeta,
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
    return toShipmentResponse(posted);
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
}
