import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ProformaInvoiceStatus,
  ProformaSourceType,
  QuotationStatus,
  SalesOrderStatus,
} from '../../generated/prisma-client';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { ActorContext, RequestAuditMeta } from '../auth/actor-context';
import { isUniqueConstraintError } from '../prisma/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { toProformaResponse } from './dto/proforma-invoice-response';

const PROFORMA_INCLUDE = {
  items: { orderBy: { createdAt: 'asc' as const } },
};

const QUOTATION_INCLUDE = {
  items: { orderBy: { createdAt: 'asc' as const } },
};

@Injectable()
export class ProformaInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: IdentityAuditClient,
  ) {}

  async createFromQuotation(
    actor: ActorContext,
    quotationId: string,
    request?: RequestAuditMeta,
  ) {
    const quotation = await this.prisma.quotation.findFirst({
      where: { id: quotationId, tenantId: actor.tenantId },
      include: QUOTATION_INCLUDE,
    });
    if (!quotation) throw new NotFoundException('Quotation not found');
    if (
      quotation.status !== QuotationStatus.SENT &&
      quotation.status !== QuotationStatus.ACCEPTED
    ) {
      throw new ConflictException(
        'Proforma can only be created from SENT or ACCEPTED quotations',
      );
    }
    if (quotation.items.length === 0) {
      throw new BadRequestException('Quotation has no items');
    }

    return this.createFromSnapshot(
      actor,
      {
        sourceType: ProformaSourceType.QUOTATION,
        sourceId: quotation.id,
        customerId: quotation.customerId,
        customerName: quotation.customerName,
        billingAddress: quotation.billingAddress,
        shippingAddress: quotation.shippingAddress,
        notes: quotation.notes,
        subtotal: quotation.subtotal,
        total: quotation.total,
        items: quotation.items.map((item) => ({
          productId: item.productId,
          productSku: item.productSku,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
        })),
      },
      request,
    );
  }

  async createFromSalesOrder(
    actor: ActorContext,
    salesOrderId: string,
    request?: RequestAuditMeta,
  ) {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id: salesOrderId, tenantId: actor.tenantId },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    });
    if (!order) throw new NotFoundException('Sales order not found');
    if (order.status === SalesOrderStatus.CANCELLED) {
      throw new ConflictException(
        'Cannot create proforma from a CANCELLED sales order',
      );
    }
    if (order.items.length === 0) {
      throw new BadRequestException('Sales order has no items');
    }

    return this.createFromSnapshot(
      actor,
      {
        sourceType: ProformaSourceType.SALES_ORDER,
        sourceId: order.id,
        customerId: order.customerId,
        customerName: order.customerName,
        billingAddress: order.billingAddress,
        shippingAddress: order.shippingAddress,
        notes: order.notes,
        subtotal: order.subtotal,
        total: order.total,
        items: order.items.map((item) => ({
          productId: item.productId,
          productSku: item.productSku,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
        })),
      },
      request,
    );
  }

  /** Shared create path for Quotation (Phase 2) and Sales Order (Phase 3). */
  async createFromSnapshot(
    actor: ActorContext,
    input: {
      sourceType: ProformaSourceType;
      sourceId: string;
      customerId: string;
      customerName: string;
      billingAddress: string | null;
      shippingAddress: string | null;
      notes: string | null;
      subtotal: Prisma.Decimal;
      total: Prisma.Decimal;
      items: Array<{
        productId: string;
        productSku: string;
        productName: string;
        quantity: Prisma.Decimal;
        unitPrice: Prisma.Decimal;
        lineTotal: Prisma.Decimal;
      }>;
    },
    request?: RequestAuditMeta,
  ) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const documentNumber = await this.nextDocumentNumber(actor.tenantId);
      try {
        const row = await this.prisma.proformaInvoice.create({
          data: {
            tenantId: actor.tenantId,
            documentNumber,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
            status: ProformaInvoiceStatus.ISSUED,
            issuedAt: new Date(),
            customerId: input.customerId,
            customerName: input.customerName,
            billingAddress: input.billingAddress,
            shippingAddress: input.shippingAddress,
            notes: input.notes,
            subtotal: input.subtotal,
            total: input.total,
            items: {
              create: input.items.map((item) => ({
                tenantId: actor.tenantId,
                productId: item.productId,
                productSku: item.productSku,
                productName: item.productName,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                lineTotal: item.lineTotal,
              })),
            },
          },
          include: PROFORMA_INCLUDE,
        });
        await this.audit.record({
          actor,
          action: 'proforma-invoice.created',
          resource: 'proforma-invoice',
          resourceId: row.id,
          metadata: {
            documentNumber: row.documentNumber,
            sourceType: row.sourceType,
            sourceId: row.sourceId,
            itemCount: row.items.length,
          },
          request,
        });
        return toProformaResponse(row);
      } catch (error) {
        if (isUniqueConstraintError(error) && attempt < 4) {
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException('Could not allocate proforma document number');
  }

  async list(actor: ActorContext) {
    const rows = await this.prisma.proformaInvoice.findMany({
      where: { tenantId: actor.tenantId },
      include: PROFORMA_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return { items: rows.map(toProformaResponse) };
  }

  async getById(actor: ActorContext, id: string) {
    const row = await this.prisma.proformaInvoice.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: PROFORMA_INCLUDE,
    });
    if (!row) throw new NotFoundException('Proforma invoice not found');
    return toProformaResponse(row);
  }

  private async nextDocumentNumber(tenantId: string): Promise<string> {
    const count = await this.prisma.proformaInvoice.count({
      where: { tenantId },
    });
    return `PF-${String(count + 1).padStart(8, '0')}`;
  }
}
