import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, QuotationStatus } from '../../generated/prisma-client';
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
import { PrismaService } from '../prisma/prisma.service';
import { toQuotationResponse } from './dto/quotation-response';
import {
  CreateQuotationDto,
  CreateQuotationItemDto,
  UpdateQuotationDto,
} from './dto/quotation.dto';

const QUOTATION_INCLUDE = {
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: { taxComponents: { orderBy: { sequence: 'asc' as const } } },
  },
};

interface QuotationLineTaxComponent {
  sequence: number;
  type: string;
  name: string | null;
  rate: Prisma.Decimal;
  componentTaxAmount: Prisma.Decimal;
}

interface QuotationLine {
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
  taxComponents: QuotationLineTaxComponent[];
}

@Injectable()
export class QuotationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
    private readonly audit: IdentityAuditClient,
    private readonly inventoryProducts: InventoryProductClient,
    private readonly accountingTaxCodes: AccountingTaxCodeClient,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreateQuotationDto,
    request?: RequestAuditMeta,
  ) {
    const customer = await this.customers.require(actor, dto.customerId);
    const lines = await this.mapLines(actor, dto.items);
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
        discountTotal: totals.discountTotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
        items: {
          create: lines.map((line) => this.toItemCreateInput(line)),
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

    const lines = dto.items ? await this.mapLines(actor, dto.items) : null;

    const row = await this.prisma.$transaction(async (tx) => {
      if (lines) {
        const totals = this.sumTotals(lines);
        await tx.quotationItem.deleteMany({
          where: { quotationId: id, tenantId: actor.tenantId },
        });
        for (const line of lines) {
          await tx.quotationItem.create({
            data: { quotationId: id, ...this.toItemCreateInput(line) },
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
            discountTotal: totals.discountTotal,
            taxTotal: totals.taxTotal,
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

  private toItemCreateInput(line: QuotationLine) {
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

  private async mapLines(
    actor: ActorContext,
    items: CreateQuotationItemDto[],
  ): Promise<QuotationLine[]> {
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
        let taxComponents: QuotationLineTaxComponent[] = [];
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

  private sumTotals(lines: QuotationLine[]): {
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
