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
import { InventoryProductClient } from '../inventory/inventory-product.client';
import { isUniqueConstraintError } from '../prisma/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { toProformaResponse } from './dto/proforma-invoice-response';
import {
  UpdateProformaInvoiceDto,
  UpdateProformaInvoiceItemDto,
} from './dto/proforma-invoice.dto';

const PROFORMA_INCLUDE = {
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

const SALES_ORDER_INCLUDE = {
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

/** A QuotationItem or SalesOrderItem row, as the shape common to both conversion sources. */
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

type ProformaSnapshotItemInput = SnapshotSourceItem;

interface ProformaLineTaxComponent {
  sequence: number;
  type: string;
  name: string | null;
  rate: Prisma.Decimal;
  componentTaxAmount: Prisma.Decimal;
}

interface ProformaLine {
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
  taxComponents: ProformaLineTaxComponent[];
}

@Injectable()
export class ProformaInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: IdentityAuditClient,
    private readonly inventoryProducts: InventoryProductClient,
    private readonly accountingTaxCodes: AccountingTaxCodeClient,
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
        discountTotal: quotation.discountTotal,
        taxTotal: quotation.taxTotal,
        total: quotation.total,
        items: quotation.items.map((item) => this.toSnapshotItemInput(item)),
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
      include: SALES_ORDER_INCLUDE,
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
        discountTotal: order.discountTotal,
        taxTotal: order.taxTotal,
        total: order.total,
        items: order.items.map((item) => this.toSnapshotItemInput(item)),
      },
      request,
    );
  }

  /** Shared create path for Quotation and Sales Order conversions. */
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
      discountTotal: Prisma.Decimal;
      taxTotal: Prisma.Decimal;
      total: Prisma.Decimal;
      items: ProformaSnapshotItemInput[];
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
            status: ProformaInvoiceStatus.DRAFT,
            customerId: input.customerId,
            customerName: input.customerName,
            billingAddress: input.billingAddress,
            shippingAddress: input.shippingAddress,
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
    return toProformaResponse(await this.require(actor, id));
  }

  async update(
    actor: ActorContext,
    id: string,
    dto: UpdateProformaInvoiceDto,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.require(actor, id);
    if (existing.status !== ProformaInvoiceStatus.DRAFT) {
      throw new ConflictException('Only DRAFT proforma invoices can be updated');
    }
    if (
      dto.notes === undefined &&
      dto.billingAddress === undefined &&
      dto.shippingAddress === undefined &&
      dto.items === undefined
    ) {
      throw new BadRequestException('No fields to update');
    }

    // Resolved (and, for items, externally-validated via HTTP) before the
    // transaction starts — mirrors QuotationsService.update(), which never
    // holds a DB transaction open across calls to inventory-service/accounting-service.
    const lines = dto.items ? await this.mapLines(actor, dto.items) : null;

    const row = await this.prisma.$transaction(async (tx) => {
      if (lines) {
        const totals = this.sumTotals(lines);
        await tx.proformaInvoiceItem.deleteMany({
          where: { proformaInvoiceId: id, tenantId: actor.tenantId },
        });
        // Per-item create (not createMany): createMany cannot create the
        // nested taxComponents relation, which would silently drop tax rows.
        for (const line of lines) {
          await tx.proformaInvoiceItem.create({
            data: { proformaInvoiceId: id, ...this.toItemCreateInput(line) },
          });
        }
        return tx.proformaInvoice.update({
          where: { id },
          data: {
            billingAddress:
              dto.billingAddress === undefined
                ? undefined
                : dto.billingAddress?.trim() || null,
            shippingAddress:
              dto.shippingAddress === undefined
                ? undefined
                : dto.shippingAddress?.trim() || null,
            notes:
              dto.notes === undefined ? undefined : dto.notes?.trim() || null,
            subtotal: totals.subtotal,
            discountTotal: totals.discountTotal,
            taxTotal: totals.taxTotal,
            total: totals.total,
          },
          include: PROFORMA_INCLUDE,
        });
      }

      return tx.proformaInvoice.update({
        where: { id },
        data: {
          billingAddress:
            dto.billingAddress === undefined
              ? undefined
              : dto.billingAddress?.trim() || null,
          shippingAddress:
            dto.shippingAddress === undefined
              ? undefined
              : dto.shippingAddress?.trim() || null,
          notes: dto.notes === undefined ? undefined : dto.notes?.trim() || null,
        },
        include: PROFORMA_INCLUDE,
      });
    });

    await this.audit.record({
      actor,
      action: 'proforma-invoice.updated',
      resource: 'proforma-invoice',
      resourceId: row.id,
      metadata: {
        itemCount: row.items.length,
        total: moneyToString(row.total),
      },
      request,
    });
    return toProformaResponse(row);
  }

  async send(actor: ActorContext, id: string, request?: RequestAuditMeta) {
    const existing = await this.require(actor, id);
    if (existing.status !== ProformaInvoiceStatus.DRAFT) {
      throw new ConflictException('Only DRAFT proforma invoices can be sent');
    }
    if (existing.items.length === 0) {
      throw new BadRequestException('Proforma invoice has no items');
    }
    const row = await this.prisma.proformaInvoice.update({
      where: { id },
      data: { status: ProformaInvoiceStatus.ISSUED, issuedAt: new Date() },
      include: PROFORMA_INCLUDE,
    });
    await this.audit.record({
      actor,
      action: 'proforma-invoice.sent',
      resource: 'proforma-invoice',
      resourceId: row.id,
      metadata: { status: row.status },
      request,
    });
    return toProformaResponse(row);
  }

  async cancel(actor: ActorContext, id: string, request?: RequestAuditMeta) {
    const existing = await this.require(actor, id);
    if (
      existing.status !== ProformaInvoiceStatus.DRAFT &&
      existing.status !== ProformaInvoiceStatus.ISSUED
    ) {
      throw new ConflictException(
        'Only DRAFT or ISSUED proforma invoices can be cancelled',
      );
    }
    const row = await this.prisma.proformaInvoice.update({
      where: { id },
      data: { status: ProformaInvoiceStatus.CANCELLED },
      include: PROFORMA_INCLUDE,
    });
    await this.audit.record({
      actor,
      action: 'proforma-invoice.cancelled',
      resource: 'proforma-invoice',
      resourceId: row.id,
      metadata: { status: row.status },
      request,
    });
    return toProformaResponse(row);
  }

  async require(actor: ActorContext, id: string) {
    const row = await this.prisma.proformaInvoice.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: PROFORMA_INCLUDE,
    });
    if (!row) throw new NotFoundException('Proforma invoice not found');
    return row;
  }

  /** Copies every UOM/discount/tax snapshot field verbatim — never recalculated. */
  private toSnapshotItemInput(
    item: SnapshotSourceItem,
  ): ProformaSnapshotItemInput {
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

  private toItemCreateInput(line: ProformaLine) {
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
   * Mirrors QuotationsService.mapLines() exactly: gross → UOM resolution
   * (base vs. alternative, validated against the product via
   * InventoryProductClient) → discountAmount → lineSubtotal → each tax
   * component independently (via AccountingTaxCodeClient) → taxAmount →
   * lineTotal. All client-supplied amounts are recomputed server-side —
   * nothing from the request is trusted as a calculated value.
   */
  private async mapLines(
    actor: ActorContext,
    items: UpdateProformaInvoiceItemDto[],
  ): Promise<ProformaLine[]> {
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
        let taxComponents: ProformaLineTaxComponent[] = [];
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

  private sumTotals(lines: ProformaLine[]): {
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

  private async nextDocumentNumber(tenantId: string): Promise<string> {
    const count = await this.prisma.proformaInvoice.count({
      where: { tenantId },
    });
    return `PF-${String(count + 1).padStart(8, '0')}`;
  }
}
