import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import {
  DomainEvent,
  EVENT_BUS,
  SalesInvoicePostedPayload,
} from '@app/messaging';
import {
  Prisma,
  ProformaInvoiceStatus,
  SalesInvoiceSourceType,
  SalesInvoiceStatus,
  SalesOrderStatus,
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
import { toSalesInvoiceResponse } from './dto/sales-invoice-response';
import {
  CreateInvoiceFromSourceDto,
  CreateSalesInvoiceDto,
  CreateSalesInvoiceItemDto,
  UpdateSalesInvoiceDto,
} from './dto/sales-invoice.dto';

const INVOICE_INCLUDE = {
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: { taxComponents: { orderBy: { sequence: 'asc' as const } } },
  },
};

const SALES_ORDER_INCLUDE = {
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: { taxComponents: { orderBy: { sequence: 'asc' as const } } },
  },
};

const PROFORMA_INCLUDE = {
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: { taxComponents: { orderBy: { sequence: 'asc' as const } } },
  },
};

/** No currency concept exists anywhere in this domain yet; every invoice is posted in this fixed unit. */
const DEFAULT_CURRENCY = 'USD';

interface SnapshotSourceTaxComponent {
  sequence: number;
  type: string;
  name: string | null;
  rate: Prisma.Decimal;
  componentTaxAmount: Prisma.Decimal;
}

/** A SalesOrderItem or ProformaInvoiceItem row, as the shape common to both conversion sources. */
interface SnapshotSourceItem {
  productId: string;
  productSku: string;
  productName: string;
  quantity: Prisma.Decimal;
  unitOfMeasureId: string | null;
  uomCode: string | null;
  uomName: string | null;
  conversionFactor: Prisma.Decimal | null;
  unitPrice: Prisma.Decimal;
  discountPercent: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  taxCodeId: string | null;
  taxCode: string | null;
  taxCodeName: string | null;
  taxAmount: Prisma.Decimal;
  lineSubtotal: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  taxComponents: SnapshotSourceTaxComponent[];
}

interface PersistItemInput {
  productId: string;
  productSku: string;
  productName: string;
  quantity: Prisma.Decimal;
  unitOfMeasureId: string | null;
  uomCode: string | null;
  uomName: string | null;
  conversionFactor: Prisma.Decimal | null;
  unitPrice: Prisma.Decimal;
  discountPercent: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  taxCodeId: string | null;
  taxCode: string | null;
  taxCodeName: string | null;
  taxAmount: Prisma.Decimal;
  lineSubtotal: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  taxComponents: SnapshotSourceTaxComponent[];
}

@Injectable()
export class SalesInvoicesService {
  private readonly logger = new Logger(SalesInvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
    private readonly audit: IdentityAuditClient,
    @Inject(EVENT_BUS) private readonly eventBus: ClientProxy,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreateSalesInvoiceDto,
    request?: RequestAuditMeta,
  ) {
    const customer = await this.customers.require(actor, dto.customerId);
    const lines = this.mapLines(actor.tenantId, dto.items);
    const totals = this.sumTotals(lines);

    return this.persist(
      actor,
      {
        sourceType: null,
        sourceId: null,
        customerId: customer.id,
        customerName: customer.name,
        billingAddress:
          dto.billingAddress?.trim() || this.formatCustomerAddress(customer),
        shippingAddress:
          dto.shippingAddress?.trim() || this.formatCustomerAddress(customer),
        paymentTermId: dto.paymentTermId ?? customer.paymentTermId,
        salespersonId: dto.salespersonId ?? customer.salespersonId,
        invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : new Date(),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        notes: dto.notes?.trim() || null,
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
        items: lines,
      },
      request,
      { source: 'manual' },
    );
  }

  async createFromSalesOrder(
    actor: ActorContext,
    salesOrderId: string,
    dto: CreateInvoiceFromSourceDto,
    request?: RequestAuditMeta,
  ) {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id: salesOrderId, tenantId: actor.tenantId },
      include: SALES_ORDER_INCLUDE,
    });
    if (!order) throw new NotFoundException('Sales order not found');
    if (order.status === SalesOrderStatus.CANCELLED) {
      throw new ConflictException(
        'Cannot create a sales invoice from a CANCELLED sales order',
      );
    }
    if (order.items.length === 0) {
      throw new BadRequestException('Sales order has no items');
    }

    const customer = await this.customers.require(actor, order.customerId);

    return this.persist(
      actor,
      {
        sourceType: SalesInvoiceSourceType.SALES_ORDER,
        sourceId: order.id,
        customerId: order.customerId,
        customerName: order.customerName,
        billingAddress: order.billingAddress,
        shippingAddress: order.shippingAddress,
        paymentTermId: customer.paymentTermId,
        salespersonId: customer.salespersonId,
        invoiceDate: dto?.invoiceDate ? new Date(dto.invoiceDate) : new Date(),
        dueDate: dto?.dueDate ? new Date(dto.dueDate) : null,
        notes: dto?.notes?.trim() || order.notes,
        subtotal: order.subtotal,
        discountTotal: order.discountTotal,
        taxTotal: order.taxTotal,
        total: order.total,
        items: order.items.map((item) => this.toSnapshotItemInput(item)),
      },
      request,
      { source: 'sales-order', salesOrderId: order.id },
    );
  }

  async createFromProformaInvoice(
    actor: ActorContext,
    proformaInvoiceId: string,
    dto: CreateInvoiceFromSourceDto,
    request?: RequestAuditMeta,
  ) {
    const proforma = await this.prisma.proformaInvoice.findFirst({
      where: { id: proformaInvoiceId, tenantId: actor.tenantId },
      include: PROFORMA_INCLUDE,
    });
    if (!proforma) throw new NotFoundException('Proforma invoice not found');
    if (proforma.status !== ProformaInvoiceStatus.ISSUED) {
      throw new ConflictException(
        'Only ISSUED proforma invoices can be converted to a sales invoice',
      );
    }
    if (proforma.items.length === 0) {
      throw new BadRequestException('Proforma invoice has no items');
    }

    const customer = await this.customers.require(actor, proforma.customerId);

    return this.persist(
      actor,
      {
        sourceType: SalesInvoiceSourceType.PROFORMA_INVOICE,
        sourceId: proforma.id,
        customerId: proforma.customerId,
        customerName: proforma.customerName,
        billingAddress: proforma.billingAddress,
        shippingAddress: proforma.shippingAddress,
        paymentTermId: customer.paymentTermId,
        salespersonId: customer.salespersonId,
        invoiceDate: dto?.invoiceDate ? new Date(dto.invoiceDate) : new Date(),
        dueDate: dto?.dueDate ? new Date(dto.dueDate) : null,
        notes: dto?.notes?.trim() || proforma.notes,
        subtotal: proforma.subtotal,
        discountTotal: proforma.discountTotal,
        taxTotal: proforma.taxTotal,
        total: proforma.total,
        items: proforma.items.map((item) => this.toSnapshotItemInput(item)),
      },
      request,
      { source: 'proforma-invoice', proformaInvoiceId: proforma.id },
    );
  }

  private async persist(
    actor: ActorContext,
    input: {
      sourceType: SalesInvoiceSourceType | null;
      sourceId: string | null;
      customerId: string;
      customerName: string;
      billingAddress: string | null;
      shippingAddress: string | null;
      paymentTermId: string | null;
      salespersonId: string | null;
      invoiceDate: Date;
      dueDate: Date | null;
      notes: string | null;
      subtotal: Prisma.Decimal;
      discountTotal: Prisma.Decimal;
      taxTotal: Prisma.Decimal;
      total: Prisma.Decimal;
      items: PersistItemInput[];
    },
    request: RequestAuditMeta | undefined,
    auditSourceMeta: Record<string, unknown>,
  ) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const invoiceNumber = await this.nextInvoiceNumber(actor.tenantId);
      try {
        const row = await this.prisma.salesInvoice.create({
          data: {
            tenantId: actor.tenantId,
            invoiceNumber,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
            status: SalesInvoiceStatus.DRAFT,
            customerId: input.customerId,
            customerName: input.customerName,
            billingAddress: input.billingAddress,
            shippingAddress: input.shippingAddress,
            paymentTermId: input.paymentTermId,
            salespersonId: input.salespersonId,
            invoiceDate: input.invoiceDate,
            dueDate: input.dueDate,
            notes: input.notes,
            subtotal: input.subtotal,
            discountTotal: input.discountTotal,
            taxTotal: input.taxTotal,
            total: input.total,
            items: {
              create: input.items.map((item) => ({
                tenantId: actor.tenantId,
                productId: item.productId,
                productSku: item.productSku,
                productName: item.productName,
                quantity: item.quantity,
                unitOfMeasureId: item.unitOfMeasureId,
                uomCode: item.uomCode,
                uomName: item.uomName,
                conversionFactor: item.conversionFactor,
                unitPrice: item.unitPrice,
                discountPercent: item.discountPercent,
                discountAmount: item.discountAmount,
                taxCodeId: item.taxCodeId,
                taxCode: item.taxCode,
                taxCodeName: item.taxCodeName,
                taxAmount: item.taxAmount,
                lineSubtotal: item.lineSubtotal,
                lineTotal: item.lineTotal,
                taxComponents: {
                  create: item.taxComponents.map((component) => ({
                    tenantId: actor.tenantId,
                    sequence: component.sequence,
                    type: component.type,
                    name: component.name,
                    rate: component.rate,
                    componentTaxAmount: component.componentTaxAmount,
                  })),
                },
              })),
            },
          },
          include: INVOICE_INCLUDE,
        });
        await this.audit.record({
          actor,
          action: 'sales-invoice.created',
          resource: 'sales-invoice',
          resourceId: row.id,
          metadata: {
            invoiceNumber: row.invoiceNumber,
            itemCount: row.items.length,
            ...auditSourceMeta,
          },
          request,
        });
        return toSalesInvoiceResponse(row);
      } catch (error) {
        if (isUniqueConstraintError(error) && attempt < 4) {
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException('Could not allocate sales invoice number');
  }

  async list(actor: ActorContext) {
    const rows = await this.prisma.salesInvoice.findMany({
      where: { tenantId: actor.tenantId },
      include: INVOICE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return { items: rows.map(toSalesInvoiceResponse) };
  }

  async getById(actor: ActorContext, id: string) {
    return toSalesInvoiceResponse(await this.require(actor, id));
  }

  async update(
    actor: ActorContext,
    id: string,
    dto: UpdateSalesInvoiceDto,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.require(actor, id);
    if (existing.status !== SalesInvoiceStatus.DRAFT) {
      throw new ConflictException('Only DRAFT sales invoices can be updated');
    }
    if (
      dto.customerId === undefined &&
      dto.notes === undefined &&
      dto.billingAddress === undefined &&
      dto.shippingAddress === undefined &&
      dto.paymentTermId === undefined &&
      dto.salespersonId === undefined &&
      dto.invoiceDate === undefined &&
      dto.dueDate === undefined &&
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
      const headerData = {
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

      if (dto.items) {
        const lines = this.mapLines(actor.tenantId, dto.items);
        const totals = this.sumTotals(lines);
        await tx.salesInvoiceItem.deleteMany({
          where: { salesInvoiceId: id, tenantId: actor.tenantId },
        });
        await tx.salesInvoiceItem.createMany({
          data: lines.map((line) => ({
            tenantId: line.tenantId,
            salesInvoiceId: id,
            productId: line.productId,
            productSku: line.productSku,
            productName: line.productName,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal: line.lineTotal,
          })),
        });
        return tx.salesInvoice.update({
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

      return tx.salesInvoice.update({
        where: { id },
        data: headerData,
        include: INVOICE_INCLUDE,
      });
    });

    await this.audit.record({
      actor,
      action: 'sales-invoice.updated',
      resource: 'sales-invoice',
      resourceId: row.id,
      metadata: {
        customerId: row.customerId,
        itemCount: row.items.length,
        total: moneyToString(row.total),
      },
      request,
    });
    return toSalesInvoiceResponse(row);
  }

  async send(actor: ActorContext, id: string, request?: RequestAuditMeta) {
    const existing = await this.require(actor, id);
    if (existing.status !== SalesInvoiceStatus.DRAFT) {
      throw new ConflictException('Only DRAFT sales invoices can be sent');
    }
    if (existing.items.length === 0) {
      throw new BadRequestException('Sales invoice has no items');
    }
    const row = await this.prisma.salesInvoice.update({
      where: { id },
      data: { status: SalesInvoiceStatus.SENT, sentAt: new Date() },
      include: INVOICE_INCLUDE,
    });
    await this.audit.record({
      actor,
      action: 'sales-invoice.sent',
      resource: 'sales-invoice',
      resourceId: row.id,
      metadata: { status: row.status },
      request,
    });

    // Sales must not write accounting journals itself (see docs/architecture/communication.md).
    // This publishes the integration point event only; accounting-service has no
    // consumer/ledger yet to actually post the entry (documented limitation).
    this.publishInvoicePosted(actor, row);

    return toSalesInvoiceResponse(row);
  }

  async cancel(actor: ActorContext, id: string, request?: RequestAuditMeta) {
    const existing = await this.require(actor, id);
    if (
      existing.status !== SalesInvoiceStatus.DRAFT &&
      existing.status !== SalesInvoiceStatus.SENT
    ) {
      throw new ConflictException(
        'Only DRAFT or SENT sales invoices can be cancelled',
      );
    }
    const row = await this.prisma.salesInvoice.update({
      where: { id },
      data: { status: SalesInvoiceStatus.CANCELLED },
      include: INVOICE_INCLUDE,
    });
    await this.audit.record({
      actor,
      action: 'sales-invoice.cancelled',
      resource: 'sales-invoice',
      resourceId: row.id,
      metadata: { status: row.status },
      request,
    });
    return toSalesInvoiceResponse(row);
  }

  async require(actor: ActorContext, id: string) {
    const row = await this.prisma.salesInvoice.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: INVOICE_INCLUDE,
    });
    if (!row) throw new NotFoundException('Sales invoice not found');
    return row;
  }

  private publishInvoicePosted(
    actor: ActorContext,
    row: { id: string; customerId: string; total: Prisma.Decimal },
  ): void {
    const payload: SalesInvoicePostedPayload = {
      invoiceId: row.id,
      tenantId: actor.tenantId,
      customerId: row.customerId,
      currency: DEFAULT_CURRENCY,
      totalAmount: moneyToString(row.total),
    };
    firstValueFrom(
      this.eventBus.emit(DomainEvent.SalesInvoicePosted, {
        eventId: randomUUID(),
        eventName: DomainEvent.SalesInvoicePosted,
        tenantId: actor.tenantId,
        occurredAt: new Date().toISOString(),
        payload,
      }),
    ).catch((error: unknown) => {
      this.logger.error(
        `Failed to publish ${DomainEvent.SalesInvoicePosted} for sales invoice ${row.id}`,
        error instanceof Error ? error.stack : undefined,
      );
    });
  }

  private formatCustomerAddress(customer: {
    street: string | null;
    street2: string | null;
    city: string | null;
    zip: string | null;
    state: string | null;
    country: string | null;
  }) {
    return (
      [
        customer.street,
        customer.street2,
        customer.city,
        customer.state,
        customer.zip,
        customer.country,
      ]
        .filter(Boolean)
        .join(', ') || null
    );
  }

  /** Copies every UOM/discount/tax snapshot field verbatim — never recalculated. */
  private toSnapshotItemInput(item: SnapshotSourceItem): PersistItemInput {
    return {
      productId: item.productId,
      productSku: item.productSku,
      productName: item.productName,
      quantity: item.quantity,
      unitOfMeasureId: item.unitOfMeasureId,
      uomCode: item.uomCode,
      uomName: item.uomName,
      conversionFactor: item.conversionFactor,
      unitPrice: item.unitPrice,
      discountPercent: item.discountPercent,
      discountAmount: item.discountAmount,
      taxCodeId: item.taxCodeId,
      taxCode: item.taxCode,
      taxCodeName: item.taxCodeName,
      taxAmount: item.taxAmount,
      lineSubtotal: item.lineSubtotal,
      lineTotal: item.lineTotal,
      taxComponents: item.taxComponents.map((component) => ({
        sequence: component.sequence,
        type: component.type,
        name: component.name,
        rate: component.rate,
        componentTaxAmount: component.componentTaxAmount,
      })),
    };
  }

  private mapLines(
    tenantId: string,
    items: CreateSalesInvoiceItemDto[],
  ) {
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
        // Manual sales invoices do not yet expose UOM/discount/tax input
        // capability, so every snapshot field is explicitly its neutral
        // value rather than left undefined.
        unitOfMeasureId: null as string | null,
        uomCode: null as string | null,
        uomName: null as string | null,
        conversionFactor: null as Prisma.Decimal | null,
        unitPrice,
        discountPercent: new Prisma.Decimal(0),
        discountAmount: new Prisma.Decimal(0),
        taxCodeId: null as string | null,
        taxCode: null as string | null,
        taxCodeName: null as string | null,
        taxAmount: new Prisma.Decimal(0),
        lineSubtotal: lineTotal,
        lineTotal,
        taxComponents: [] as SnapshotSourceTaxComponent[],
      };
    });
  }

  private sumTotals(lines: Array<{ lineTotal: Prisma.Decimal }>): {
    subtotal: Prisma.Decimal;
    discountTotal: Prisma.Decimal;
    taxTotal: Prisma.Decimal;
    total: Prisma.Decimal;
  } {
    const subtotal = lines.reduce(
      (sum, line) => sum.plus(line.lineTotal),
      new Prisma.Decimal(0),
    );
    return {
      subtotal,
      discountTotal: new Prisma.Decimal(0),
      taxTotal: new Prisma.Decimal(0),
      total: subtotal,
    };
  }

  private async nextInvoiceNumber(tenantId: string): Promise<string> {
    const count = await this.prisma.salesInvoice.count({ where: { tenantId } });
    return `INV-${String(count + 1).padStart(8, '0')}`;
  }
}
