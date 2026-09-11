import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ProformaInvoiceStatus,
  QuotationStatus,
  SalesOrderStatus,
  ShipmentStatus,
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
import { toSalesOrderResponse } from './dto/sales-order-response';
import {
  CreateSalesOrderDto,
  CreateSalesOrderItemDto,
  UpdateSalesOrderDto,
} from './dto/sales-order.dto';

const ORDER_INCLUDE = {
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: { taxComponents: { orderBy: { sequence: 'asc' as const } } },
  },
};

const QUOTATION_INCLUDE = {
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

interface SnapshotSourceTaxComponent {
  sequence: number;
  type: string;
  name: string | null;
  rate: Prisma.Decimal;
  componentTaxAmount: Prisma.Decimal;
}

/** A QuotationItem or ProformaInvoiceItem row, as the shape common to both conversion sources. */
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

interface SalesOrderLineTaxComponent {
  sequence: number;
  type: string;
  name: string | null;
  rate: Prisma.Decimal;
  componentTaxAmount: Prisma.Decimal;
}

interface SalesOrderLine {
  tenantId: string;
  productId: string;
  productSku: string;
  productName: string;
  quantity: Prisma.Decimal;
  unitOfMeasureId: string;
  uomCode: string;
  uomName: string;
  conversionFactor: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  gross: Prisma.Decimal;
  discountPercent: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  taxCodeId: string | null;
  taxCode: string | null;
  taxCodeName: string | null;
  taxAmount: Prisma.Decimal;
  lineSubtotal: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  taxComponents: SalesOrderLineTaxComponent[];
}

@Injectable()
export class SalesOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
    private readonly audit: IdentityAuditClient,
    private readonly inventoryProducts: InventoryProductClient,
    private readonly accountingTaxCodes: AccountingTaxCodeClient,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreateSalesOrderDto,
    request?: RequestAuditMeta,
  ) {
    const customer = await this.customers.require(actor, dto.customerId);
    const lines = await this.mapLines(actor, dto.items);
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
        paymentTermId: dto.paymentTermId ?? customer.paymentTermId,
        salespersonId: dto.salespersonId ?? customer.salespersonId,
        deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : null,
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
        items: {
          create: lines.map((line) => this.toItemCreateInput(line)),
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
      include: QUOTATION_INCLUDE,
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
          paymentTermId: quotation.paymentTermId,
          salespersonId: quotation.salespersonId,
          deliveryDate: quotation.deliveryDate,
          subtotal: quotation.subtotal,
          discountTotal: quotation.discountTotal,
          taxTotal: quotation.taxTotal,
          total: quotation.total,
          items: {
            create: quotation.items.map((item) =>
              this.toSnapshotItemInput(item, actor.tenantId),
            ),
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

  async convertFromProforma(
    actor: ActorContext,
    proformaInvoiceId: string,
    request?: RequestAuditMeta,
  ) {
    const proforma = await this.prisma.proformaInvoice.findFirst({
      where: { id: proformaInvoiceId, tenantId: actor.tenantId },
      include: PROFORMA_INCLUDE,
    });
    if (!proforma) throw new NotFoundException('Proforma invoice not found');
    if (proforma.status !== ProformaInvoiceStatus.ISSUED) {
      throw new ConflictException(
        'Only ISSUED proforma invoices can be converted to a sales order',
      );
    }
    if (proforma.items.length === 0) {
      throw new BadRequestException('Proforma invoice has no items');
    }

    const existing = await this.prisma.salesOrder.findFirst({
      where: { tenantId: actor.tenantId, proformaInvoiceId: proforma.id },
      include: ORDER_INCLUDE,
    });
    if (existing) {
      throw new ConflictException(
        'Proforma invoice has already been converted to a sales order',
      );
    }

    try {
      const row = await this.prisma.salesOrder.create({
        data: {
          tenantId: actor.tenantId,
          customerId: proforma.customerId,
          proformaInvoiceId: proforma.id,
          customerName: proforma.customerName,
          billingAddress: proforma.billingAddress,
          shippingAddress: proforma.shippingAddress,
          notes: proforma.notes,
          // ProformaInvoice has no paymentTermId/salespersonId/deliveryDate
          // columns (those exist only on Quotation) — nothing to copy here.
          subtotal: proforma.subtotal,
          discountTotal: proforma.discountTotal,
          taxTotal: proforma.taxTotal,
          total: proforma.total,
          items: {
            create: proforma.items.map((item) =>
              this.toSnapshotItemInput(item, actor.tenantId),
            ),
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
          source: 'proforma-invoice',
          proformaInvoiceId: proforma.id,
        },
        request,
      });
      return toSalesOrderResponse(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Proforma invoice has already been converted to a sales order',
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

    // Resolved (and, for items, externally-validated via HTTP) before the
    // transaction starts — mirrors QuotationsService.update(), which never
    // holds a DB transaction open across calls to inventory-service/accounting-service.
    const lines = dto.items ? await this.mapLines(actor, dto.items) : null;

    const row = await this.prisma.$transaction(async (tx) => {
      if (lines) {
        const totals = this.sumTotals(lines);
        await tx.salesOrderItem.deleteMany({
          where: { salesOrderId: id, tenantId: actor.tenantId },
        });
        // Per-item create (not createMany): createMany cannot create the
        // nested taxComponents relation, which would silently drop tax rows.
        for (const line of lines) {
          await tx.salesOrderItem.create({
            data: { salesOrderId: id, ...this.toItemCreateInput(line) },
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
            subtotal: totals.subtotal,
            discountTotal: totals.discountTotal,
            taxTotal: totals.taxTotal,
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

  private toItemCreateInput(line: SalesOrderLine) {
    return {
      tenantId: line.tenantId,
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
      shippedQuantity: new Prisma.Decimal(0),
      taxComponents: {
        create: line.taxComponents.map((component) => ({
          tenantId: line.tenantId,
          sequence: component.sequence,
          type: component.type,
          name: component.name,
          rate: component.rate,
          componentTaxAmount: component.componentTaxAmount,
        })),
      },
    };
  }

  /**
   * Copies every UOM/discount/tax snapshot field verbatim — never
   * recalculated. Shared by the Quotation and Proforma Invoice conversions.
   */
  private toSnapshotItemInput(item: SnapshotSourceItem, tenantId: string) {
    return {
      tenantId,
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
      shippedQuantity: new Prisma.Decimal(0),
      taxComponents: {
        create: item.taxComponents.map((component) => ({
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
    items: CreateSalesOrderItemDto[],
  ): Promise<SalesOrderLine[]> {
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
        let taxComponents: SalesOrderLineTaxComponent[] = [];
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
          tenantId: actor.tenantId,
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

  private sumTotals(lines: SalesOrderLine[]): {
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
}
