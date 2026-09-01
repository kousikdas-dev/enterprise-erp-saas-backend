import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, QuotationStatus } from '../../generated/prisma-client';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { ActorContext, RequestAuditMeta } from '../auth/actor-context';
import {
  moneyToString,
  parseMoney,
  parsePositiveDecimal,
} from '../common/decimal';
import { CustomersService } from '../customers/customers.service';
import { PrismaService } from '../prisma/prisma.service';
import { toQuotationResponse } from './dto/quotation-response';
import {
  CreateQuotationDto,
  CreateQuotationItemDto,
  UpdateQuotationDto,
} from './dto/quotation.dto';

const QUOTATION_INCLUDE = {
  items: { orderBy: { createdAt: 'asc' as const } },
};

@Injectable()
export class QuotationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
    private readonly audit: IdentityAuditClient,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreateQuotationDto,
    request?: RequestAuditMeta,
  ) {
    const customer = await this.customers.require(actor, dto.customerId);
    const lines = this.mapLines(actor.tenantId, dto.items);
    const totals = this.sumTotals(lines);
    const row = await this.prisma.quotation.create({
      data: {
        tenantId: actor.tenantId,
        customerId: customer.id,
        customerName: customer.name,
        billingAddress:
        dto.billingAddress?.trim() || this.formatCustomerAddress(customer),
        shippingAddress:
        dto.shippingAddress?.trim() || this.formatCustomerAddress(customer),
        notes: dto.notes?.trim() || null,
        paymentTermId: dto.paymentTermId ?? customer.paymentTermId,
        salespersonId: dto.salespersonId ?? customer.salespersonId,
        deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : null,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
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
          })),
        },
      },
      include: QUOTATION_INCLUDE,
    });
    await this.audit.record({
      actor,
      action: 'quotation.created',
      resource: 'quotation',
      resourceId: row.id,
      metadata: { customerId: row.customerId, itemCount: row.items.length },
      request,
    });
    return toQuotationResponse(row);
  }

  async list(actor: ActorContext) {
    const rows = await this.prisma.quotation.findMany({
      where: { tenantId: actor.tenantId },
      include: QUOTATION_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return { items: rows.map(toQuotationResponse) };
  }

  async getById(actor: ActorContext, id: string) {
    return toQuotationResponse(await this.require(actor, id));
  }

  async update(
    actor: ActorContext,
    id: string,
    dto: UpdateQuotationDto,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.require(actor, id);
    if (existing.status !== QuotationStatus.DRAFT) {
      throw new ConflictException('Only DRAFT quotations can be updated');
    }
    if (
      dto.customerId === undefined &&
      dto.notes === undefined &&
      dto.validUntil === undefined &&
      dto.billingAddress === undefined &&
      dto.shippingAddress === undefined &&
      dto.paymentTermId === undefined &&
      dto.salespersonId === undefined &&
      dto.deliveryDate === undefined &&
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
        await tx.quotationItem.deleteMany({
          where: { quotationId: id, tenantId: actor.tenantId },
        });
        await tx.quotationItem.createMany({
          data: lines.map((line) => ({
            tenantId: line.tenantId,
            quotationId: id,
            productId: line.productId,
            productSku: line.productSku,
            productName: line.productName,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal: line.lineTotal,
          })),
        });
        return tx.quotation.update({
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
            paymentTermId:
              dto.paymentTermId === undefined
                ? customer
                  ? customer.paymentTermId
                  : undefined
                : dto.paymentTermId,
            salespersonId:
              dto.salespersonId === undefined
                ? customer
                  ? customer.salespersonId
                  : undefined
                : dto.salespersonId,
            deliveryDate:
              dto.deliveryDate === undefined
                ? undefined
                : dto.deliveryDate
                  ? new Date(dto.deliveryDate)
                  : null,
            validUntil:
              dto.validUntil === undefined
                ? undefined
                : dto.validUntil
                  ? new Date(dto.validUntil)
                  : null,
            subtotal: totals.subtotal,
            total: totals.total,
          },
          include: QUOTATION_INCLUDE,
        });
      }

      return tx.quotation.update({
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
          paymentTermId:
            dto.paymentTermId === undefined
              ? customer
                ? customer.paymentTermId
                : undefined
              : dto.paymentTermId,
          salespersonId:
            dto.salespersonId === undefined
              ? customer
                ? customer.salespersonId
                : undefined
              : dto.salespersonId,
          deliveryDate:
            dto.deliveryDate === undefined
              ? undefined
              : dto.deliveryDate
                ? new Date(dto.deliveryDate)
                : null,
          validUntil:
            dto.validUntil === undefined
              ? undefined
              : dto.validUntil
                ? new Date(dto.validUntil)
                : null,
        },
        include: QUOTATION_INCLUDE,
      });
    });

    await this.audit.record({
      actor,
      action: 'quotation.updated',
      resource: 'quotation',
      resourceId: row.id,
      metadata: {
        customerId: row.customerId,
        itemCount: row.items.length,
        total: moneyToString(row.total),
      },
      request,
    });
    return toQuotationResponse(row);
  }

  async send(actor: ActorContext, id: string, request?: RequestAuditMeta) {
    const existing = await this.require(actor, id);
    if (existing.status !== QuotationStatus.DRAFT) {
      throw new ConflictException('Only DRAFT quotations can be sent');
    }
    if (existing.items.length === 0) {
      throw new BadRequestException('Quotation has no items');
    }
    const row = await this.prisma.quotation.update({
      where: { id },
      data: { status: QuotationStatus.SENT, sentAt: new Date() },
      include: QUOTATION_INCLUDE,
    });
    await this.audit.record({
      actor,
      action: 'quotation.sent',
      resource: 'quotation',
      resourceId: row.id,
      metadata: { status: row.status },
      request,
    });
    return toQuotationResponse(row);
  }

  async accept(actor: ActorContext, id: string, request?: RequestAuditMeta) {
    const existing = await this.require(actor, id);
    if (existing.status !== QuotationStatus.SENT) {
      throw new ConflictException('Only SENT quotations can be accepted');
    }
    const row = await this.prisma.quotation.update({
      where: { id },
      data: { status: QuotationStatus.ACCEPTED, acceptedAt: new Date() },
      include: QUOTATION_INCLUDE,
    });
    await this.audit.record({
      actor,
      action: 'quotation.accepted',
      resource: 'quotation',
      resourceId: row.id,
      metadata: { status: row.status },
      request,
    });
    return toQuotationResponse(row);
  }

  async reject(actor: ActorContext, id: string, request?: RequestAuditMeta) {
    const existing = await this.require(actor, id);
    if (existing.status !== QuotationStatus.SENT) {
      throw new ConflictException('Only SENT quotations can be rejected');
    }
    const row = await this.prisma.quotation.update({
      where: { id },
      data: { status: QuotationStatus.REJECTED, rejectedAt: new Date() },
      include: QUOTATION_INCLUDE,
    });
    await this.audit.record({
      actor,
      action: 'quotation.rejected',
      resource: 'quotation',
      resourceId: row.id,
      metadata: { status: row.status },
      request,
    });
    return toQuotationResponse(row);
  }

  async cancel(actor: ActorContext, id: string, request?: RequestAuditMeta) {
    const existing = await this.require(actor, id);
    if (
      existing.status !== QuotationStatus.DRAFT &&
      existing.status !== QuotationStatus.SENT
    ) {
      throw new ConflictException(
        'Only DRAFT or SENT quotations can be cancelled',
      );
    }
    const row = await this.prisma.quotation.update({
      where: { id },
      data: { status: QuotationStatus.CANCELLED },
      include: QUOTATION_INCLUDE,
    });
    await this.audit.record({
      actor,
      action: 'quotation.cancelled',
      resource: 'quotation',
      resourceId: row.id,
      metadata: { status: row.status },
      request,
    });
    return toQuotationResponse(row);
  }

  async require(actor: ActorContext, id: string) {
    const row = await this.prisma.quotation.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: QUOTATION_INCLUDE,
    });
    if (!row) throw new NotFoundException('Quotation not found');
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

  private mapLines(tenantId: string, items: CreateQuotationItemDto[]) {
    return items.map((item) => {
      const quantity = parsePositiveDecimal(item.quantity);
      const unitPrice = parseMoney(item.unitPrice);
      const lineTotal = quantity.mul(unitPrice);
      return {
        tenantId,
        productId: item.productId,
        productSku: item.productSku.trim(),
        productName: item.productName.trim(),
        quantity,
        unitPrice,
        lineTotal,
      };
    });
  }

  private sumTotals(
    lines: Array<{ lineTotal: Prisma.Decimal }>,
  ): { subtotal: Prisma.Decimal; total: Prisma.Decimal } {
    const subtotal = lines.reduce(
      (sum, line) => sum.plus(line.lineTotal),
      new Prisma.Decimal(0),
    );
    return { subtotal, total: subtotal };
  }
}
