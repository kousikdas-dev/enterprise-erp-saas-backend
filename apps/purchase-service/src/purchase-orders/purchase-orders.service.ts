import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PurchaseOrderStatus } from '../../generated/prisma-client';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { ActorContext, RequestAuditMeta } from '../auth/actor-context';
import { parseMoney, parsePositiveDecimal } from '../common/decimal';
import { PrismaService } from '../prisma/prisma.service';
import { toPurchaseOrderResponse } from './dto/purchase-order-response';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto';

const ORDER_INCLUDE = { items: { orderBy: { createdAt: 'asc' as const } } };

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: IdentityAuditClient,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreatePurchaseOrderDto,
    request?: RequestAuditMeta,
  ) {
    await this.requireSupplier(actor, dto.supplierId);
    const items = dto.items.map((item) => ({
      tenantId: actor.tenantId,
      productId: item.productId,
      quantity: parsePositiveDecimal(item.quantity),
      unitCost: parseMoney(item.unitCost),
    }));
    const row = await this.prisma.purchaseOrder.create({
      data: {
        tenantId: actor.tenantId,
        supplierId: dto.supplierId,
        notes: dto.notes?.trim() || null,
        items: { create: items },
      },
      include: ORDER_INCLUDE,
    });
    await this.audit.record({
      actor,
      action: 'purchase-order.created',
      resource: 'purchase-order',
      resourceId: row.id,
      metadata: { supplierId: row.supplierId, itemCount: row.items.length },
      request,
    });
    return toPurchaseOrderResponse(row);
  }

  async list(actor: ActorContext) {
    const rows = await this.prisma.purchaseOrder.findMany({
      where: { tenantId: actor.tenantId },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return { items: rows.map(toPurchaseOrderResponse) };
  }

  async getById(actor: ActorContext, id: string) {
    return toPurchaseOrderResponse(await this.requireOrder(actor, id));
  }

  async update(
    actor: ActorContext,
    id: string,
    dto: UpdatePurchaseOrderDto,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.requireOrder(actor, id);
    if (existing.status !== PurchaseOrderStatus.DRAFT) {
      throw new ConflictException('Only DRAFT purchase orders can be updated');
    }
    if (dto.supplierId) await this.requireSupplier(actor, dto.supplierId);
    if (
      dto.supplierId === undefined &&
      dto.notes === undefined &&
      dto.items === undefined
    ) {
      throw new BadRequestException('No fields to update');
    }

    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        await tx.purchaseOrderItem.deleteMany({
          where: { purchaseOrderId: id, tenantId: actor.tenantId },
        });
        await tx.purchaseOrderItem.createMany({
          data: dto.items.map((item) => ({
            tenantId: actor.tenantId,
            purchaseOrderId: id,
            productId: item.productId,
            quantity: parsePositiveDecimal(item.quantity),
            unitCost: parseMoney(item.unitCost),
          })),
        });
      }
      return tx.purchaseOrder.update({
        where: { id },
        data: {
          supplierId: dto.supplierId,
          notes:
            dto.notes === undefined ? undefined : dto.notes.trim() || null,
        },
        include: ORDER_INCLUDE,
      });
    });

    await this.audit.record({
      actor,
      action: 'purchase-order.updated',
      resource: 'purchase-order',
      resourceId: row.id,
      metadata: {
        supplierId: row.supplierId,
        itemCount: row.items.length,
      },
      request,
    });
    return toPurchaseOrderResponse(row);
  }

  async confirm(
    actor: ActorContext,
    id: string,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.requireOrder(actor, id);
    if (existing.status !== PurchaseOrderStatus.DRAFT) {
      throw new ConflictException('Only DRAFT purchase orders can be confirmed');
    }
    if (existing.items.length === 0) {
      throw new BadRequestException('Purchase order has no items');
    }
    const row = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.CONFIRMED },
      include: ORDER_INCLUDE,
    });
    await this.audit.record({
      actor,
      action: 'purchase-order.confirmed',
      resource: 'purchase-order',
      resourceId: row.id,
      metadata: { status: row.status },
      request,
    });
    return toPurchaseOrderResponse(row);
  }

  async cancel(
    actor: ActorContext,
    id: string,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.requireOrder(actor, id);
    if (
      existing.status !== PurchaseOrderStatus.DRAFT &&
      existing.status !== PurchaseOrderStatus.CONFIRMED
    ) {
      throw new ConflictException(
        'Only DRAFT or CONFIRMED purchase orders can be cancelled',
      );
    }
    if (existing.status === PurchaseOrderStatus.CONFIRMED) {
      const received = existing.items.some((item) =>
        item.receivedQuantity.gt(0),
      );
      if (received) {
        throw new ConflictException(
          'Cannot cancel a purchase order that has receipts',
        );
      }
    }
    const row = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.CANCELLED },
      include: ORDER_INCLUDE,
    });
    await this.audit.record({
      actor,
      action: 'purchase-order.cancelled',
      resource: 'purchase-order',
      resourceId: row.id,
      metadata: { status: row.status },
      request,
    });
    return toPurchaseOrderResponse(row);
  }

  private async requireSupplier(actor: ActorContext, id: string) {
    const row = await this.prisma.supplier.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!row) throw new NotFoundException('Supplier not found');
    return row;
  }

  private async requireOrder(actor: ActorContext, id: string) {
    const row = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: ORDER_INCLUDE,
    });
    if (!row) throw new NotFoundException('Purchase order not found');
    return row;
  }
}
