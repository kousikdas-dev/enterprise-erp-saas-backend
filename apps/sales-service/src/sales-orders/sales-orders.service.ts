import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  QuotationStatus,
  SalesOrderStatus,
  ShipmentStatus,
} from '../../generated/prisma-client';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { ActorContext, RequestAuditMeta } from '../auth/actor-context';
import {
  moneyToString,
  parseMoney,
  parsePositiveDecimal,
} from '../common/decimal';
import { CustomersService } from '../customers/customers.service';
import { isUniqueConstraintError } from '../prisma/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { toSalesOrderResponse } from './dto/sales-order-response';
import {
  CreateSalesOrderDto,
  CreateSalesOrderItemDto,
  UpdateSalesOrderDto,
} from './dto/sales-order.dto';

const ORDER_INCLUDE = {
  items: { orderBy: { createdAt: 'asc' as const } },
};

@Injectable()
export class SalesOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
    private readonly audit: IdentityAuditClient,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreateSalesOrderDto,
    request?: RequestAuditMeta,
  ) {
    const customer = await this.customers.require(actor, dto.customerId);
    const lines = this.mapLines(actor.tenantId, dto.items);
    const totals = this.sumTotals(lines);
    const row = await this.prisma.salesOrder.create({
      data: {
        tenantId: actor.tenantId,
        customerId: customer.id,
        customerName: customer.name,
        billingAddress:
          dto.billingAddress?.trim() || this.formatCustomerAddress(customer),
        shippingAddress:
          dto.shippingAddress?.trim() || this.formatCustomerAddress(customer),
        notes: dto.notes?.trim() || null,
        subtotal: totals.subtotal,
        total: totals.total,
        items: {
          create: lines.map((line) => ({
            tenantId: line.tenantId,
            productId: line.productId,
            productSku: line.productSku,
            productName: line.productName,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal: line.lineTotal,
            shippedQuantity: new Prisma.Decimal(0),
          })),
        },
      },
      include: ORDER_INCLUDE,
    });
    await this.audit.record({
      actor,
      action: 'sales-order.created',
      resource: 'sales-order',
      resourceId: row.id,
      metadata: {
        customerId: row.customerId,
        itemCount: row.items.length,
        source: 'manual',
      },
      request,
    });
    return toSalesOrderResponse(row);
  }

  async convertFromQuotation(
    actor: ActorContext,
    quotationId: string,
    request?: RequestAuditMeta,
  ) {
    const quotation = await this.prisma.quotation.findFirst({
      where: { id: quotationId, tenantId: actor.tenantId },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    });
    if (!quotation) throw new NotFoundException('Quotation not found');
    if (quotation.status !== QuotationStatus.ACCEPTED) {
      throw new ConflictException(
        'Only ACCEPTED quotations can be converted to a sales order',
      );
    }
    if (quotation.items.length === 0) {
      throw new BadRequestException('Quotation has no items');
    }

    const existing = await this.prisma.salesOrder.findFirst({
      where: { tenantId: actor.tenantId, quotationId: quotation.id },
      include: ORDER_INCLUDE,
    });
    if (existing) {
      throw new ConflictException(
        'Quotation has already been converted to a sales order',
      );
    }

    try {
      const row = await this.prisma.salesOrder.create({
        data: {
          tenantId: actor.tenantId,
          customerId: quotation.customerId,
          quotationId: quotation.id,
          customerName: quotation.customerName,
          billingAddress: quotation.billingAddress,
          shippingAddress: quotation.shippingAddress,
          notes: quotation.notes,
          subtotal: quotation.subtotal,
          total: quotation.total,
          items: {
            create: quotation.items.map((item) => ({
              tenantId: actor.tenantId,
              productId: item.productId,
              productSku: item.productSku,
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              lineTotal: item.lineTotal,
              shippedQuantity: new Prisma.Decimal(0),
            })),
          },
        },
        include: ORDER_INCLUDE,
      });
      await this.audit.record({
        actor,
        action: 'sales-order.created',
        resource: 'sales-order',
        resourceId: row.id,
        metadata: {
          customerId: row.customerId,
          itemCount: row.items.length,
          source: 'quotation',
          quotationId: quotation.id,
        },
        request,
      });
      return toSalesOrderResponse(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Quotation has already been converted to a sales order',
        );
      }
      throw error;
    }
  }

  async list(actor: ActorContext) {
    const rows = await this.prisma.salesOrder.findMany({
      where: { tenantId: actor.tenantId },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return { items: rows.map(toSalesOrderResponse) };
  }

  async getById(actor: ActorContext, id: string) {
    return toSalesOrderResponse(await this.require(actor, id));
  }

  async update(
    actor: ActorContext,
    id: string,
    dto: UpdateSalesOrderDto,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.require(actor, id);
    if (existing.status !== SalesOrderStatus.DRAFT) {
      throw new ConflictException('Only DRAFT sales orders can be updated');
    }
    if (
      dto.customerId === undefined &&
      dto.notes === undefined &&
      dto.billingAddress === undefined &&
      dto.shippingAddress === undefined &&
      dto.items === undefined
    ) {
      throw new BadRequestException('No fields to update');
    }

    let customer = null as Awaited<
      ReturnType<CustomersService['require']>
    > | null;
    if (dto.customerId) {
      customer = await this.customers.require(actor, dto.customerId);
    }

    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        const lines = this.mapLines(actor.tenantId, dto.items);
        const totals = this.sumTotals(lines);
        await tx.salesOrderItem.deleteMany({
          where: { salesOrderId: id, tenantId: actor.tenantId },
        });
        await tx.salesOrderItem.createMany({
          data: lines.map((line) => ({
            tenantId: line.tenantId,
            salesOrderId: id,
            productId: line.productId,
            productSku: line.productSku,
            productName: line.productName,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal: line.lineTotal,
            shippedQuantity: new Prisma.Decimal(0),
          })),
        });
        return tx.salesOrder.update({
          where: { id },
          data: {
            customerId: customer?.id,
            customerName: customer?.name,
            billingAddress:
              dto.billingAddress === undefined
                ? customer
                  ? this.formatCustomerAddress(customer)
                  : undefined
                : dto.billingAddress?.trim() || null,
            shippingAddress:
              dto.shippingAddress === undefined
                ? customer
                  ? this.formatCustomerAddress(customer)
                  : undefined
                : dto.shippingAddress?.trim() || null,
            notes:
              dto.notes === undefined ? undefined : dto.notes.trim() || null,
            subtotal: totals.subtotal,
            total: totals.total,
          },
          include: ORDER_INCLUDE,
        });
      }

      return tx.salesOrder.update({
        where: { id },
        data: {
          customerId: customer?.id,
          customerName: customer?.name,
          billingAddress:
            dto.billingAddress === undefined
              ? customer
                ? this.formatCustomerAddress(customer)
                : undefined
                : dto.billingAddress?.trim() || null,
          shippingAddress:
            dto.shippingAddress === undefined
              ? customer
                ? this.formatCustomerAddress(customer)
                : undefined
                : dto.shippingAddress?.trim() || null,
          notes: dto.notes === undefined ? undefined : dto.notes.trim() || null,
        },
        include: ORDER_INCLUDE,
      });
    });

    await this.audit.record({
      actor,
      action: 'sales-order.updated',
      resource: 'sales-order',
      resourceId: row.id,
      metadata: {
        customerId: row.customerId,
        itemCount: row.items.length,
        total: moneyToString(row.total),
      },
      request,
    });
    return toSalesOrderResponse(row);
  }

  async confirm(actor: ActorContext, id: string, request?: RequestAuditMeta) {
    const existing = await this.require(actor, id);
    if (existing.status !== SalesOrderStatus.DRAFT) {
      throw new ConflictException('Only DRAFT sales orders can be confirmed');
    }
    if (existing.items.length === 0) {
      throw new BadRequestException('Sales order has no items');
    }
    const row = await this.prisma.salesOrder.update({
      where: { id },
      data: {
        status: SalesOrderStatus.CONFIRMED,
        confirmedAt: new Date(),
      },
      include: ORDER_INCLUDE,
    });
    await this.audit.record({
      actor,
      action: 'sales-order.confirmed',
      resource: 'sales-order',
      resourceId: row.id,
      metadata: { status: row.status },
      request,
    });
    return toSalesOrderResponse(row);
  }

  async cancel(actor: ActorContext, id: string, request?: RequestAuditMeta) {
    const existing = await this.require(actor, id);
    if (existing.status === SalesOrderStatus.DRAFT) {
      // allowed
    } else if (existing.status === SalesOrderStatus.CONFIRMED) {
      const postedCount = await this.prisma.shipment.count({
        where: {
          tenantId: actor.tenantId,
          salesOrderId: id,
          status: ShipmentStatus.POSTED,
        },
      });
      if (postedCount > 0) {
        throw new ConflictException(
          'Cannot cancel a sales order that has POSTED shipments',
        );
      }
    } else if (existing.status === SalesOrderStatus.PARTIALLY_FULFILLED) {
      throw new ConflictException(
        'Cannot cancel a partially fulfilled sales order',
      );
    } else {
      throw new ConflictException('Sales order cannot be cancelled');
    }

    const row = await this.prisma.salesOrder.update({
      where: { id },
      data: { status: SalesOrderStatus.CANCELLED },
      include: ORDER_INCLUDE,
    });
    await this.audit.record({
      actor,
      action: 'sales-order.cancelled',
      resource: 'sales-order',
      resourceId: row.id,
      metadata: { status: row.status },
      request,
    });
    return toSalesOrderResponse(row);
  }

  async require(actor: ActorContext, id: string) {
    const row = await this.prisma.salesOrder.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: ORDER_INCLUDE,
    });
    if (!row) throw new NotFoundException('Sales order not found');
    return row;
  }

  private formatCustomerAddress(customer: {
    street: string | null;
    street2: string | null;
    city: string | null;
    zip: string | null;
    state: string | null;
    country: string | null;
  }) {
    return [
      customer.street,
      customer.street2,
      customer.city,
      customer.state,
      customer.zip,
      customer.country,
    ]
      .filter(Boolean)
      .join(', ') || null;
  }

  private mapLines(tenantId: string, items: CreateSalesOrderItemDto[]) {
    return items.map((item) => {
      const quantity = parsePositiveDecimal(item.quantity);
      const unitPrice = parseMoney(item.unitPrice);
      return {
        tenantId,
        productId: item.productId,
        productSku: item.productSku.trim(),
        productName: item.productName.trim(),
        quantity,
        unitPrice,
        lineTotal: quantity.mul(unitPrice),
      };
    });
  }

  private sumTotals(lines: Array<{ lineTotal: Prisma.Decimal }>) {
    const subtotal = lines.reduce(
      (sum, line) => sum.plus(line.lineTotal),
      new Prisma.Decimal(0),
    );
    return { subtotal, total: subtotal };
  }
}
