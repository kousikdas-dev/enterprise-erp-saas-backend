import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  GoodsReceiptStatus,
  Prisma,
  PurchaseOrderStatus,
} from '../../generated/prisma-client';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { ActorContext, RequestAuditMeta } from '../auth/actor-context';
import {
  parsePositiveDecimal,
  quantityToString,
} from '../common/decimal';
import { InventoryStockClient } from '../inventory/inventory-stock.client';
import { PrismaService } from '../prisma/prisma.service';
import { toGoodsReceiptResponse } from './dto/goods-receipt-response';
import { CreateGoodsReceiptDto } from './dto/goods-receipt.dto';

const RECEIPT_INCLUDE = {
  items: { orderBy: { createdAt: 'asc' as const } },
};

@Injectable()
export class GoodsReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryStockClient,
    private readonly audit: IdentityAuditClient,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreateGoodsReceiptDto,
    request?: RequestAuditMeta,
  ) {
    const goodsReceiptId = randomUUID();
    const prepared = await this.preparePendingReceipt(
      actor,
      goodsReceiptId,
      dto,
    );
    await this.inventory.applyReceipt(actor, {
      referenceType: 'goods_receipt',
      referenceId: goodsReceiptId,
      warehouseId: dto.warehouseId,
      lines: prepared.inventoryLines,
    });
    const posted = await this.finalizePosted(actor, goodsReceiptId, request);
    return posted;
  }

  async post(
    actor: ActorContext,
    id: string,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.prisma.goodsReceipt.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: {
        ...RECEIPT_INCLUDE,
        purchaseOrder: { include: { items: true } },
      },
    });
    if (!existing) throw new NotFoundException('Goods receipt not found');
    if (existing.status === GoodsReceiptStatus.POSTED) {
      return toGoodsReceiptResponse(existing);
    }
    if (existing.status !== GoodsReceiptStatus.PENDING_STOCK) {
      throw new ConflictException('Goods receipt cannot be posted');
    }

    const poItemsById = new Map(
      existing.purchaseOrder.items.map((item) => [item.id, item]),
    );
    const inventoryLines = existing.items.map((item) => {
      const poItem = poItemsById.get(item.purchaseOrderItemId);
      if (!poItem) {
        throw new ConflictException('Purchase order item missing for receipt');
      }
      return {
        productId: poItem.productId,
        quantity: quantityToString(item.quantity),
      };
    });

    await this.inventory.applyReceipt(actor, {
      referenceType: 'goods_receipt',
      referenceId: existing.id,
      warehouseId: existing.warehouseId,
      lines: inventoryLines,
    });
    return this.finalizePosted(actor, existing.id, request);
  }

  async list(actor: ActorContext) {
    const rows = await this.prisma.goodsReceipt.findMany({
      where: { tenantId: actor.tenantId },
      include: RECEIPT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return { items: rows.map(toGoodsReceiptResponse) };
  }

  async getById(actor: ActorContext, id: string) {
    const row = await this.prisma.goodsReceipt.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: RECEIPT_INCLUDE,
    });
    if (!row) throw new NotFoundException('Goods receipt not found');
    return toGoodsReceiptResponse(row);
  }

  private async preparePendingReceipt(
    actor: ActorContext,
    goodsReceiptId: string,
    dto: CreateGoodsReceiptDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.findFirst({
        where: { id: dto.purchaseOrderId, tenantId: actor.tenantId },
        include: { items: true },
      });
      if (!order) throw new NotFoundException('Purchase order not found');
      if (
        order.status !== PurchaseOrderStatus.CONFIRMED &&
        order.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED
      ) {
        throw new ConflictException(
          'Purchase order is not open for goods receipt',
        );
      }

      const itemsById = new Map(order.items.map((item) => [item.id, item]));
      const receiptItems: Array<{
        purchaseOrderItemId: string;
        productId: string;
        quantity: Prisma.Decimal;
      }> = [];

      for (const line of dto.items) {
        const poItem = itemsById.get(line.purchaseOrderItemId);
        if (!poItem || poItem.tenantId !== actor.tenantId) {
          throw new NotFoundException('Purchase order item not found');
        }
        const qty = parsePositiveDecimal(line.quantity);
        const remaining = poItem.quantity.minus(poItem.receivedQuantity);
        if (qty.gt(remaining)) {
          throw new ConflictException(
            'Receipt quantity exceeds remaining ordered quantity',
          );
        }
        receiptItems.push({
          purchaseOrderItemId: poItem.id,
          productId: poItem.productId,
          quantity: qty,
        });
      }

      await tx.goodsReceipt.create({
        data: {
          id: goodsReceiptId,
          tenantId: actor.tenantId,
          purchaseOrderId: order.id,
          warehouseId: dto.warehouseId,
          status: GoodsReceiptStatus.PENDING_STOCK,
          items: {
            create: receiptItems.map((item) => ({
              tenantId: actor.tenantId,
              purchaseOrderItemId: item.purchaseOrderItemId,
              quantity: item.quantity,
            })),
          },
        },
      });

      return {
        inventoryLines: receiptItems.map((item) => ({
          productId: item.productId,
          quantity: quantityToString(item.quantity),
        })),
      };
    });
  }

  private async finalizePosted(
    actor: ActorContext,
    goodsReceiptId: string,
    request?: RequestAuditMeta,
  ) {
    const posted = await this.prisma.$transaction(async (tx) => {
      const receipt = await tx.goodsReceipt.findFirst({
        where: { id: goodsReceiptId, tenantId: actor.tenantId },
        include: {
          ...RECEIPT_INCLUDE,
          purchaseOrder: { include: { items: true } },
        },
      });
      if (!receipt) throw new NotFoundException('Goods receipt not found');
      if (receipt.status === GoodsReceiptStatus.POSTED) {
        return receipt;
      }
      if (receipt.status !== GoodsReceiptStatus.PENDING_STOCK) {
        throw new ConflictException('Goods receipt cannot be finalized');
      }

      for (const item of receipt.items) {
        const poItem = receipt.purchaseOrder.items.find(
          (row) => row.id === item.purchaseOrderItemId,
        );
        if (!poItem) {
          throw new ConflictException('Purchase order item missing');
        }
        const nextReceived = poItem.receivedQuantity.plus(item.quantity);
        if (nextReceived.gt(poItem.quantity)) {
          throw new ConflictException(
            'Receipt quantity exceeds remaining ordered quantity',
          );
        }
        await tx.purchaseOrderItem.update({
          where: { id: poItem.id },
          data: { receivedQuantity: nextReceived },
        });
      }

      const refreshedItems = await tx.purchaseOrderItem.findMany({
        where: {
          purchaseOrderId: receipt.purchaseOrderId,
          tenantId: actor.tenantId,
        },
      });
      const fullyReceived = refreshedItems.every((item) =>
        item.receivedQuantity.eq(item.quantity),
      );
      await tx.purchaseOrder.update({
        where: { id: receipt.purchaseOrderId },
        data: {
          status: fullyReceived
            ? PurchaseOrderStatus.RECEIVED
            : PurchaseOrderStatus.PARTIALLY_RECEIVED,
        },
      });

      return tx.goodsReceipt.update({
        where: { id: receipt.id },
        data: {
          status: GoodsReceiptStatus.POSTED,
          receivedAt: new Date(),
        },
        include: RECEIPT_INCLUDE,
      });
    });

    await this.audit.record({
      actor,
      action: 'goods-receipt.posted',
      resource: 'goods-receipt',
      resourceId: posted.id,
      metadata: {
        purchaseOrderId: posted.purchaseOrderId,
        warehouseId: posted.warehouseId,
        itemCount: posted.items.length,
      },
      request,
    });
    return toGoodsReceiptResponse(posted);
  }
}
