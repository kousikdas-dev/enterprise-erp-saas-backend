import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PurchaseOrderStatus } from '../../generated/prisma-client';
import { AccountingTaxCodeClient } from '../accounting/accounting-tax-code.client';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { ActorContext, RequestAuditMeta } from '../auth/actor-context';
import {
  moneyToString,
  parseConversionFactor,
  parseMoney,
  parsePercent,
  parsePositiveDecimal,
  roundMoney,
} from '../common/decimal';
import { InventoryProductClient } from '../inventory/inventory-product.client';
import { isUniqueConstraintError } from '../prisma/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { toPurchaseOrderResponse } from './dto/purchase-order-response';
import {
  CreatePurchaseOrderDto,
  CreatePurchaseOrderItemDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto';

const ORDER_INCLUDE = {
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: { taxComponents: { orderBy: { sequence: 'asc' as const } } },
  },
};

interface PurchaseOrderLineTaxComponent {
  sequence: number;
  type: string;
  name: string | null;
  rate: Prisma.Decimal;
  componentTaxAmount: Prisma.Decimal;
}

interface PurchaseOrderLine {
  tenantId: string;
  productId: string;
  productSku: string;
  productName: string;
  quantity: Prisma.Decimal;
  unitOfMeasureId: string;
  uomCode: string;
  uomName: string;
  conversionFactor: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  gross: Prisma.Decimal;
  discountPercent: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  taxCodeId: string | null;
  taxCode: string | null;
  taxCodeName: string | null;
  taxAmount: Prisma.Decimal;
  lineSubtotal: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  taxComponents: PurchaseOrderLineTaxComponent[];
}

interface SupplierSnapshot {
  supplier: { id: string };
  supplierName: string;
  supplierGstin: string | null;
  supplierBillingAddress: string | null;
  supplierDispatchAddress: string | null;
  supplierBillingAddressId: string | null;
  supplierDispatchAddressId: string | null;
  paymentTermId: string | null;
}

interface ResolvedAddress {
  id: string | null;
  text: string | null;
}

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: IdentityAuditClient,
    private readonly inventoryProducts: InventoryProductClient,
    private readonly accountingTaxCodes: AccountingTaxCodeClient,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreatePurchaseOrderDto,
    request?: RequestAuditMeta,
  ) {
    const snapshot = await this.snapshotSupplier(
      actor,
      dto.supplierId,
      dto.billingAddressId,
      dto.dispatchAddressId,
    );
    const lines = await this.mapLines(actor, dto.items);
    const totals = this.sumTotals(lines);
    const expectedDeliveryDate = dto.expectedDeliveryDate
      ? new Date(dto.expectedDeliveryDate)
      : null;

    for (let attempt = 0; attempt < 5; attempt++) {
      const poNumber = await this.nextPoNumber(actor.tenantId);
      try {
        const row = await this.prisma.purchaseOrder.create({
          data: {
            tenantId: actor.tenantId,
            poNumber,
            supplierId: snapshot.supplier.id,
            supplierName: snapshot.supplierName,
            supplierGstin: snapshot.supplierGstin,
            supplierBillingAddress: snapshot.supplierBillingAddress,
            supplierDispatchAddress: snapshot.supplierDispatchAddress,
            supplierBillingAddressId: snapshot.supplierBillingAddressId,
            supplierDispatchAddressId: snapshot.supplierDispatchAddressId,
            paymentTermId: dto.paymentTermId ?? snapshot.paymentTermId,
            buyerId: dto.buyerId ?? null,
            supplierReference: dto.supplierReference?.trim() || null,
            expectedDeliveryDate,
            notes: dto.notes?.trim() || null,
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
          action: 'purchase-order.created',
          resource: 'purchase-order',
          resourceId: row.id,
          metadata: {
            poNumber: row.poNumber,
            supplierId: row.supplierId,
            itemCount: row.items.length,
          },
          request,
        });
        return toPurchaseOrderResponse(row);
      } catch (error) {
        if (isUniqueConstraintError(error) && attempt < 4) {
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException('Could not allocate purchase order number');
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
    if (
      dto.supplierId === undefined &&
      dto.supplierReference === undefined &&
      dto.expectedDeliveryDate === undefined &&
      dto.buyerId === undefined &&
      dto.paymentTermId === undefined &&
      dto.billingAddressId === undefined &&
      dto.dispatchAddressId === undefined &&
      dto.notes === undefined &&
      dto.items === undefined
    ) {
      throw new BadRequestException('No fields to update');
    }

    // Resolved (and, for items, externally-validated via HTTP) before the
    // transaction starts — mirrors SalesOrdersService.update(), which never
    // holds a DB transaction open across calls to inventory-service/accounting-service.
    const snapshot = dto.supplierId
      ? await this.snapshotSupplier(
          actor,
          dto.supplierId,
          dto.billingAddressId,
          dto.dispatchAddressId,
        )
      : null;
    // Supplier not changing: an explicit address id is still resolved (and
    // validated) against the order's existing supplier, independently per
    // type — selecting a new billing address never touches dispatch, and
    // vice versa. Omitted ids leave their column untouched (existing
    // "undefined = don't update" convention), never silently re-defaulted.
    const needsAddressLookup =
      !snapshot &&
      (dto.billingAddressId !== undefined ||
        dto.dispatchAddressId !== undefined);
    const activeAddresses = needsAddressLookup
      ? await this.loadActiveAddresses(actor, existing.supplierId)
      : null;
    const billingAddress: ResolvedAddress | undefined =
      activeAddresses && dto.billingAddressId !== undefined
        ? this.resolveSupplierAddress(
            activeAddresses,
            'BILLING',
            dto.billingAddressId,
          )
        : undefined;
    const dispatchAddress: ResolvedAddress | undefined =
      activeAddresses && dto.dispatchAddressId !== undefined
        ? this.resolveSupplierAddress(
            activeAddresses,
            'DISPATCH',
            dto.dispatchAddressId,
          )
        : undefined;
    const lines = dto.items ? await this.mapLines(actor, dto.items) : null;

    // paymentTermId: an explicit dto value always wins; otherwise it is
    // re-derived from the supplier only when the supplier itself changes
    // (mirrors SalesOrdersService.update()'s paymentTermId/salespersonId
    // handling exactly). Other new header fields are plain pass-through —
    // undefined means "leave untouched", never silently re-derived.
    const paymentTermId =
      dto.paymentTermId === undefined
        ? (snapshot ? snapshot.paymentTermId : undefined)
        : dto.paymentTermId;
    const supplierReference =
      dto.supplierReference === undefined
        ? undefined
        : dto.supplierReference.trim() || null;
    const expectedDeliveryDate =
      dto.expectedDeliveryDate === undefined
        ? undefined
        : dto.expectedDeliveryDate
          ? new Date(dto.expectedDeliveryDate)
          : null;
    const buyerId = dto.buyerId === undefined ? undefined : dto.buyerId;
    const supplierBillingAddress = snapshot
      ? snapshot.supplierBillingAddress
      : billingAddress?.text;
    const supplierDispatchAddress = snapshot
      ? snapshot.supplierDispatchAddress
      : dispatchAddress?.text;
    const supplierBillingAddressId = snapshot
      ? snapshot.supplierBillingAddressId
      : billingAddress?.id;
    const supplierDispatchAddressId = snapshot
      ? snapshot.supplierDispatchAddressId
      : dispatchAddress?.id;

    const row = await this.prisma.$transaction(async (tx) => {
      if (lines) {
        const totals = this.sumTotals(lines);
        await tx.purchaseOrderItem.deleteMany({
          where: { purchaseOrderId: id, tenantId: actor.tenantId },
        });
        // Per-item create (not createMany): createMany cannot create the
        // nested taxComponents relation, which would silently drop tax rows.
        for (const line of lines) {
          await tx.purchaseOrderItem.create({
            data: { purchaseOrderId: id, ...this.toItemCreateInput(line) },
          });
        }
        return tx.purchaseOrder.update({
          where: { id },
          data: {
            supplierId: snapshot?.supplier.id,
            supplierName: snapshot?.supplierName,
            supplierGstin: snapshot?.supplierGstin,
            supplierBillingAddress,
            supplierDispatchAddress,
            supplierBillingAddressId,
            supplierDispatchAddressId,
            paymentTermId,
            buyerId,
            supplierReference,
            expectedDeliveryDate,
            notes:
              dto.notes === undefined ? undefined : dto.notes.trim() || null,
            subtotal: totals.subtotal,
            discountTotal: totals.discountTotal,
            taxTotal: totals.taxTotal,
            total: totals.total,
          },
          include: ORDER_INCLUDE,
        });
      }

      return tx.purchaseOrder.update({
        where: { id },
        data: {
          supplierId: snapshot?.supplier.id,
          supplierName: snapshot?.supplierName,
          supplierGstin: snapshot?.supplierGstin,
          supplierBillingAddress,
          supplierDispatchAddress,
          supplierBillingAddressId,
          supplierDispatchAddressId,
          paymentTermId,
          buyerId,
          supplierReference,
          expectedDeliveryDate,
          notes: dto.notes === undefined ? undefined : dto.notes.trim() || null,
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
        total: moneyToString(row.total),
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

  /**
   * Tenant-scoped, human-readable business document number — separate from
   * the database UUID and never supplied by the client as authoritative.
   * Mirrors ProformaInvoice/SalesInvoice's count-based numbering exactly
   * (`PO-00000001`); create() retries on a unique-constraint collision so
   * concurrent creation cannot produce a duplicate number.
   */
  private async nextPoNumber(tenantId: string): Promise<string> {
    const count = await this.prisma.purchaseOrder.count({
      where: { tenantId },
    });
    return `PO-${String(count + 1).padStart(8, '0')}`;
  }

  private async requireOrder(actor: ActorContext, id: string) {
    const row = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: ORDER_INCLUDE,
    });
    if (!row) throw new NotFoundException('Purchase order not found');
    return row;
  }

  /**
   * Snapshots supplier name/GSTIN/payment-term and the BILLING/DISPATCH
   * address (formatted to text) at order create/update time. Never
   * re-derived afterward unless supplierId itself changes. An explicit
   * billingAddressId/dispatchAddressId pins a specific SupplierAddress;
   * omitted, it falls back to the supplier's default address of that type
   * (existing behavior, unchanged). DISPATCH here is purely informational
   * (the supplier's own shipping origin) — it is never written to
   * GoodsReceipt.warehouseId, which remains our destination warehouse.
   */
  private async snapshotSupplier(
    actor: ActorContext,
    supplierId: string,
    billingAddressId?: string,
    dispatchAddressId?: string,
  ): Promise<SupplierSnapshot> {
    const supplier = await this.requireSupplier(actor, supplierId);
    const addresses = await this.loadActiveAddresses(actor, supplierId);
    const billing = this.resolveSupplierAddress(
      addresses,
      'BILLING',
      billingAddressId,
    );
    const dispatch = this.resolveSupplierAddress(
      addresses,
      'DISPATCH',
      dispatchAddressId,
    );
    return {
      supplier,
      supplierName: supplier.name,
      supplierGstin: supplier.gstin,
      supplierBillingAddress: billing.text,
      supplierDispatchAddress: dispatch.text,
      supplierBillingAddressId: billing.id,
      supplierDispatchAddressId: dispatch.id,
      paymentTermId: supplier.paymentTermId,
    };
  }

  private async loadActiveAddresses(actor: ActorContext, supplierId: string) {
    return this.prisma.supplierAddress.findMany({
      where: { tenantId: actor.tenantId, supplierId, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Resolves the SupplierAddress to snapshot for one type, from the
   * supplier's active addresses (already tenant/supplier-scoped by
   * loadActiveAddresses). An explicit addressId must be present in that
   * list and match the requested type, or the request is rejected outright
   * — it never silently falls back to a different address. With no
   * explicit id, preserves the existing default-address behavior (the list
   * is pre-sorted isDefault-first, then oldest; null if none exists).
   */
  private resolveSupplierAddress(
    addresses: Array<{
      id: string;
      type: string;
      addressLine1: string;
      addressLine2: string | null;
      city: string;
      state: string | null;
      postalCode: string | null;
      country: string;
    }>,
    type: 'BILLING' | 'DISPATCH',
    addressId?: string,
  ): ResolvedAddress {
    if (addressId) {
      const match = addresses.find((a) => a.id === addressId);
      if (!match) {
        throw new BadRequestException(
          `Selected ${type.toLowerCase()} address was not found for this supplier`,
        );
      }
      if (match.type !== type) {
        throw new BadRequestException(
          `Selected address is not a ${type.toLowerCase()} address`,
        );
      }
      return { id: match.id, text: this.formatSupplierAddress(match) };
    }

    const match = addresses.find((a) => a.type === type) ?? null;
    return { id: match?.id ?? null, text: this.formatSupplierAddress(match) };
  }

  private formatSupplierAddress(
    address: {
      addressLine1: string;
      addressLine2: string | null;
      city: string;
      state: string | null;
      postalCode: string | null;
      country: string;
    } | null,
  ): string | null {
    if (!address) return null;
    return (
      [
        address.addressLine1,
        address.addressLine2,
        address.city,
        address.state,
        address.postalCode,
        address.country,
      ]
        .filter(Boolean)
        .join(', ') || null
    );
  }

  private toItemCreateInput(line: PurchaseOrderLine) {
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
      unitCost: line.unitCost,
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
   * Mirrors SalesOrdersService.mapLines() exactly: gross → UOM resolution
   * (base vs. alternative, validated against the product via
   * InventoryProductClient) → discountAmount → lineSubtotal → each tax
   * component independently (via AccountingTaxCodeClient) → taxAmount →
   * lineTotal. All client-supplied amounts are recomputed server-side —
   * nothing from the request is trusted as a calculated value.
   */
  private async mapLines(
    actor: ActorContext,
    items: CreatePurchaseOrderItemDto[],
  ): Promise<PurchaseOrderLine[]> {
    return Promise.all(
      items.map(async (item) => {
        const quantity = parsePositiveDecimal(item.quantity);
        const unitCost = parseMoney(item.unitCost);
        const gross = roundMoney(quantity.mul(unitCost));

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
          // Alternate-UOM conversion factor must be present and a valid
          // positive decimal — it is never defaulted to 1 for a non-base
          // unit, since that would silently misrepresent the commercial
          // quantity actually ordered (Section 19.4's validation rule).
          conversionFactor = parseConversionFactor(alternative.conversionFactor);
        }

        const discountPercent = parsePercent(item.discountPercent ?? '0');
        const discountAmount = roundMoney(
          gross.mul(discountPercent).div(100),
        );
        const lineSubtotal = gross.minus(discountAmount);

        let taxCode: string | null = null;
        let taxCodeName: string | null = null;
        let taxComponents: PurchaseOrderLineTaxComponent[] = [];
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
          unitCost,
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

  private sumTotals(lines: PurchaseOrderLine[]): {
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
