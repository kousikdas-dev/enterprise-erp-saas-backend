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
  SalesInvoicePaymentStatus,
  SalesInvoiceSourceType,
  SalesInvoiceStatus,
  SalesOrderStatus,
} from '../../generated/prisma-client';
import { AccountingTaxCodeClient } from '../accounting/accounting-tax-code.client';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { ActorContext, RequestAuditMeta } from '../auth/actor-context';
import {
  moneyToString,
  parseMoney,
  parsePercent,
  parsePositiveDecimal,
  roundMoney,
} from '../common/decimal';
import { CustomersService } from '../customers/customers.service';
import { InventoryProductClient } from '../inventory/inventory-product.client';
import { isUniqueConstraintError } from '../prisma/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { toSalesInvoiceResponse } from './dto/sales-invoice-response';
import { toSalesPaymentResponse } from './dto/sales-payment-response';
import {
  CreateInvoiceFromSourceDto,
  CreateSalesInvoiceDto,
  CreateSalesInvoiceItemDto,
  CreateSalesPaymentDto,
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

/** mapLines() output: a PersistItemInput plus the pre-discount gross amount, needed for sumTotals()'s subtotal. */
type MappedInvoiceLine = PersistItemInput & { gross: Prisma.Decimal };

@Injectable()
export class SalesInvoicesService {
  private readonly logger = new Logger(SalesInvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
    private readonly audit: IdentityAuditClient,
    @Inject(EVENT_BUS) private readonly eventBus: ClientProxy,
    private readonly inventoryProducts: InventoryProductClient,
    private readonly accountingTaxCodes: AccountingTaxCodeClient,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreateSalesInvoiceDto,
    request?: RequestAuditMeta,
  ) {
    const customer = await this.customers.require(actor, dto.customerId);
    const lines = await this.mapLines(actor, dto.items);
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

    return this.persist(
      actor,
      {
        sourceType: SalesInvoiceSourceType.SALES_ORDER,
        sourceId: order.id,
        customerId: order.customerId,
        customerName: order.customerName,
        billingAddress: order.billingAddress,
        shippingAddress: order.shippingAddress,
        // Sales Order is authoritative here (mirrors
        // SalesOrdersService.convertFromQuotation's quotation.paymentTermId /
        // quotation.salespersonId) — never falls back to Customer, even when null.
        paymentTermId: order.paymentTermId,
        salespersonId: order.salespersonId,
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

    // Resolved (and, for items, externally-validated via HTTP) before the transaction
    // starts — mirrors QuotationsService.update(), which never holds a DB transaction
    // open across calls to inventory-service/accounting-service.
    const lines = dto.items ? await this.mapLines(actor, dto.items) : null;

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

      if (lines) {
        const totals = this.sumTotals(lines);
        await tx.salesInvoiceItem.deleteMany({
          where: { salesInvoiceId: id, tenantId: actor.tenantId },
        });
        // Per-item create (not createMany): createMany cannot create the nested
        // taxComponents relation, which would silently drop tax-component rows.
        for (const line of lines) {
          await tx.salesInvoiceItem.create({
            data: {
              salesInvoiceId: id,
              ...this.toItemCreateData(actor.tenantId, line),
            },
          });
        }
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
    // A zero-total invoice has no balance due, so it is already fully paid
    // the moment it is sent — no payment could ever legitimately be recorded
    // against it (any positive amount would exceed the zero balance).
    const paymentStatus = existing.total.eq(0)
      ? SalesInvoicePaymentStatus.PAID
      : SalesInvoicePaymentStatus.UNPAID;
    const row = await this.prisma.salesInvoice.update({
      where: { id },
      data: { status: SalesInvoiceStatus.SENT, sentAt: new Date(), paymentStatus },
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
    if (existing.amountPaid.gt(0)) {
      throw new ConflictException(
        'Cannot cancel a sales invoice that has recorded payments',
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

  /**
   * Records a payment against a SENT sales invoice. The SalesInvoice row is
   * locked FOR UPDATE for the duration of the transaction (mirroring
   * ShipmentsService's finalizePosted locking pattern) so the balance-due
   * check and the amountPaid/paymentStatus update happen against a single,
   * serialized read of the authoritative row — never an application-level
   * read taken outside the transaction.
   */
  async recordPayment(
    actor: ActorContext,
    id: string,
    dto: CreateSalesPaymentDto,
    request?: RequestAuditMeta,
  ) {
    const amount = parseMoney(dto.amount);
    if (amount.lte(0)) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }

    const { invoice, payment } = await this.prisma.$transaction(async (tx) => {
      const lockRows = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          SELECT id FROM sales_invoices
          WHERE id = ${id}::uuid AND "tenantId" = ${actor.tenantId}::uuid
          FOR UPDATE
        `,
      );
      if (!lockRows[0]) {
        throw new NotFoundException('Sales invoice not found');
      }

      const existing = await tx.salesInvoice.findFirstOrThrow({
        where: { id, tenantId: actor.tenantId },
      });

      if (existing.status !== SalesInvoiceStatus.SENT) {
        throw new ConflictException(
          'Only SENT sales invoices can receive payments',
        );
      }
      if (existing.paymentStatus === SalesInvoicePaymentStatus.PAID) {
        throw new ConflictException('Sales invoice is already fully paid');
      }

      const balanceDue = existing.total.minus(existing.amountPaid);
      if (amount.gt(balanceDue)) {
        throw new ConflictException(
          'Payment amount exceeds the remaining balance due',
        );
      }

      const createdPayment = await tx.salesPayment.create({
        data: {
          tenantId: actor.tenantId,
          salesInvoiceId: id,
          amount,
          paymentDate: new Date(dto.paymentDate),
          paymentMethodId: dto.paymentMethodId ?? null,
          reference: dto.reference?.trim() || null,
          notes: dto.notes?.trim() || null,
        },
      });

      const newAmountPaid = existing.amountPaid.plus(amount);
      const newPaymentStatus = newAmountPaid.gte(existing.total)
        ? SalesInvoicePaymentStatus.PAID
        : SalesInvoicePaymentStatus.PARTIALLY_PAID;

      const updatedInvoice = await tx.salesInvoice.update({
        where: { id },
        data: { amountPaid: newAmountPaid, paymentStatus: newPaymentStatus },
        include: INVOICE_INCLUDE,
      });

      return { invoice: updatedInvoice, payment: createdPayment };
    });

    await this.audit.record({
      actor,
      action: 'sales-invoice.payment-recorded',
      resource: 'sales-invoice',
      resourceId: invoice.id,
      metadata: {
        paymentId: payment.id,
        amount: moneyToString(payment.amount),
        amountPaid: moneyToString(invoice.amountPaid),
        paymentStatus: invoice.paymentStatus,
      },
      request,
    });

    return {
      payment: toSalesPaymentResponse(payment),
      invoice: toSalesInvoiceResponse(invoice),
    };
  }

  async listPayments(actor: ActorContext, id: string) {
    await this.require(actor, id);
    const rows = await this.prisma.salesPayment.findMany({
      where: { salesInvoiceId: id, tenantId: actor.tenantId },
      orderBy: [{ paymentDate: 'asc' }, { createdAt: 'asc' }],
    });
    return { items: rows.map(toSalesPaymentResponse) };
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

  /**
   * Mirrors QuotationsService.mapLines() exactly: gross → UOM resolution
   * (base vs. alternative, validated against the product via
   * InventoryProductClient) → discountAmount → lineSubtotal → each tax
   * component independently (via AccountingTaxCodeClient) → taxAmount →
   * lineTotal. All client-supplied amounts are recomputed server-side —
   * nothing from the request is trusted as a calculated value.
   */
  private async mapLines(
    actor: ActorContext,
    items: CreateSalesInvoiceItemDto[],
  ): Promise<MappedInvoiceLine[]> {
    return Promise.all(
      items.map(async (item) => {
        const quantity = parsePositiveDecimal(item.quantity);
        const unitPrice = parseMoney(item.unitPrice);
        const gross = roundMoney(quantity.mul(unitPrice));

        const uomOptions = await this.inventoryProducts.getUomOptions(
          actor,
          item.productId,
        );
        let uomCode: string;
        let uomName: string;
        let conversionFactor: Prisma.Decimal;
        if (item.unitOfMeasureId === uomOptions.base.unitOfMeasureId) {
          uomCode = uomOptions.base.code;
          uomName = uomOptions.base.name;
          conversionFactor = new Prisma.Decimal(1);
        } else {
          const alternative = uomOptions.alternatives.find(
            (candidate) => candidate.unitOfMeasureId === item.unitOfMeasureId,
          );
          if (!alternative) {
            throw new BadRequestException(
              'Selected unit of measure is not valid for this product',
            );
          }
          uomCode = alternative.code;
          uomName = alternative.name;
          conversionFactor = new Prisma.Decimal(alternative.conversionFactor);
        }

        const discountPercent = parsePercent(item.discountPercent ?? '0');
        const discountAmount = roundMoney(
          gross.mul(discountPercent).div(100),
        );
        const lineSubtotal = gross.minus(discountAmount);

        let taxCode: string | null = null;
        let taxCodeName: string | null = null;
        let taxComponents: SnapshotSourceTaxComponent[] = [];
        let taxAmount = new Prisma.Decimal(0);

        if (item.taxCodeId) {
          const taxCodeResponse = await this.accountingTaxCodes.getById(
            actor,
            item.taxCodeId,
          );
          taxCode = taxCodeResponse.code;
          taxCodeName = taxCodeResponse.name;
          taxComponents = taxCodeResponse.components.map((component) => {
            const rate = new Prisma.Decimal(component.rate);
            const componentTaxAmount = roundMoney(
              lineSubtotal.mul(rate).div(100),
            );
            return {
              sequence: component.sequence,
              type: component.type,
              name: component.name,
              rate,
              componentTaxAmount,
            };
          });
          taxAmount = taxComponents.reduce(
            (sum, component) => sum.plus(component.componentTaxAmount),
            new Prisma.Decimal(0),
          );
        }

        const lineTotal = lineSubtotal.plus(taxAmount);

        return {
          productId: item.productId,
          productSku: item.productSku.trim(),
          productName: item.productName.trim(),
          quantity,
          unitOfMeasureId: item.unitOfMeasureId,
          uomCode,
          uomName,
          conversionFactor,
          unitPrice,
          gross,
          discountPercent,
          discountAmount,
          taxCodeId: item.taxCodeId ?? null,
          taxCode,
          taxCodeName,
          taxAmount,
          lineSubtotal,
          lineTotal,
          taxComponents,
        };
      }),
    );
  }

  /** Builds the nested-create payload (including taxComponents) for one item, shared by update()'s per-item replacement loop. */
  private toItemCreateData(tenantId: string, line: PersistItemInput) {
    return {
      tenantId,
      productId: line.productId,
      productSku: line.productSku,
      productName: line.productName,
      quantity: line.quantity,
      unitOfMeasureId: line.unitOfMeasureId,
      uomCode: line.uomCode,
      uomName: line.uomName,
      conversionFactor: line.conversionFactor,
      unitPrice: line.unitPrice,
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

  /** Mirrors QuotationsService.sumTotals(): subtotal is the sum of pre-discount gross amounts, not lineTotal. */
  private sumTotals(lines: MappedInvoiceLine[]): {
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
    const count = await this.prisma.salesInvoice.count({ where: { tenantId } });
    return `INV-${String(count + 1).padStart(8, '0')}`;
  }
}
