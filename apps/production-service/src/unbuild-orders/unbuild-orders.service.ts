import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Bom,
  BomItem,
  Prisma,
  UnbuildOrder,
  UnbuildOrderItem,
  UnbuildOrderStatus,
} from '../../generated/prisma-client';
import { ActorContext } from '../auth/actor-context';
import { parsePositiveDecimal, quantityToString } from '../common/decimal';
import {
  InventoryUnbuildClient,
  UnbuildPostingResult,
} from '../inventory/inventory-unbuild.client';
import {
  InventoryProductClient,
  InventoryProductDetail,
} from '../inventory/inventory-product.client';
import { InventoryWarehouseClient } from '../inventory/inventory-warehouse.client';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueConstraintError } from '../prisma/prisma-errors';
import { toUnbuildOrderResponse } from './dto/unbuild-order-response';
import { CreateUnbuildOrderDto, UpdateUnbuildOrderDto } from './dto/unbuild-order.dto';

const MAX_NUMBER_RETRIES = 5;
// Generous versus one synchronous HTTP round trip to inventory-service —
// this is a liveness parameter only (how soon a *different* request may
// reclaim an apparently-stuck PROCESSING claim), never the mechanism that
// prevents double-posting. That guarantee comes from inventory-service's
// own idempotency ledger under Postgres's unique-constraint serialization
// (see design report, "Concurrency and recovery").
const STALE_PROCESSING_MS = 2 * 60 * 1000;

type BomWithItems = Bom & { items: BomItem[] };
type UnbuildOrderWithItems = UnbuildOrder & { items: UnbuildOrderItem[] };

interface MappedItem {
  componentProductId: string;
  data: Prisma.UnbuildOrderItemUncheckedCreateWithoutUnbuildOrderInput;
}

export interface ListUnbuildOrdersQuery {
  status?: UnbuildOrderStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class UnbuildOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryProducts: InventoryProductClient,
    private readonly inventoryWarehouses: InventoryWarehouseClient,
    private readonly inventoryUnbuild: InventoryUnbuildClient,
  ) {}

  async create(actor: ActorContext, dto: CreateUnbuildOrderDto) {
    const product = await this.requireManufacturableProduct(actor, dto.productId);
    const bom = await this.requireBomForUnbuild(actor, dto.bomId, dto.productId);
    const quantity = parsePositiveDecimal(dto.quantity);
    const uom = this.resolveBaseUom(product, dto.unitOfMeasureId);
    await this.validateWarehouse(actor, dto.warehouseId);

    let sourceProductionOrderNumber: string | null = null;
    if (dto.sourceProductionOrderId) {
      const source = await this.prisma.productionOrder.findFirst({
        where: { id: dto.sourceProductionOrderId, tenantId: actor.tenantId },
      });
      if (!source) throw new NotFoundException('Source production order not found');
      sourceProductionOrderNumber = source.orderNumber;
    }

    const items = this.defaultItemsFromBom(actor, bom, quantity);

    for (let attempt = 0; attempt < MAX_NUMBER_RETRIES; attempt += 1) {
      const orderNumber = await this.nextOrderNumber(actor.tenantId);
      try {
        const row = await this.prisma.unbuildOrder.create({
          data: {
            tenantId: actor.tenantId,
            orderNumber,
            productId: dto.productId,
            productSku: product.sku,
            productName: product.name,
            bomId: dto.bomId,
            bomVersion: bom.version,
            quantity,
            unitOfMeasureId: uom.unitOfMeasureId,
            uomCode: uom.code,
            uomName: uom.name,
            warehouseId: dto.warehouseId,
            sourceProductionOrderId: dto.sourceProductionOrderId ?? null,
            sourceProductionOrderNumber,
            status: 'DRAFT',
            unbuildDate: new Date(dto.unbuildDate),
            notes: dto.notes?.trim() || null,
            items: { create: items.map((item) => item.data) },
          },
          include: { items: true },
        });
        return toUnbuildOrderResponse(row);
      } catch (error) {
        if (isUniqueConstraintError(error) && attempt < MAX_NUMBER_RETRIES - 1) {
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException('Could not allocate an unbuild order number');
  }

  async list(actor: ActorContext, query: ListUnbuildOrdersQuery = {}) {
    const page = query.page && query.page > 0 ? Math.floor(query.page) : 1;
    const pageSize =
      query.pageSize && query.pageSize > 0
        ? Math.min(Math.floor(query.pageSize), 100)
        : 20;

    const where: Prisma.UnbuildOrderWhereInput = { tenantId: actor.tenantId };
    if (query.status) where.status = query.status;
    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { productSku: { contains: search, mode: 'insensitive' } },
        { productName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.unbuildOrder.count({ where }),
      this.prisma.unbuildOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { items: true },
      }),
    ]);

    return {
      items: rows.map(toUnbuildOrderResponse),
      total,
      page,
      pageSize,
    };
  }

  async getById(actor: ActorContext, id: string) {
    return toUnbuildOrderResponse(await this.requireOrder(actor, id));
  }

  async update(actor: ActorContext, id: string, dto: UpdateUnbuildOrderDto) {
    const order = await this.requireOrder(actor, id);
    if (order.status !== 'DRAFT') {
      throw new ConflictException(`A ${order.status} unbuild order cannot be edited`);
    }

    const data: Prisma.UnbuildOrderUpdateInput = {};
    let items: MappedItem[] | undefined;

    if (dto.quantity !== undefined) {
      const quantity = parsePositiveDecimal(dto.quantity);
      data.quantity = quantity;
      const bom = await this.requireBomForUnbuild(actor, order.bomId, order.productId);
      items = this.defaultItemsFromBom(actor, bom, quantity);
    }
    if (dto.warehouseId !== undefined) {
      await this.validateWarehouse(actor, dto.warehouseId);
      data.warehouseId = dto.warehouseId;
    }
    if (dto.unbuildDate !== undefined) data.unbuildDate = new Date(dto.unbuildDate);
    if (dto.notes !== undefined) data.notes = dto.notes.trim() || null;

    if (Object.keys(data).length === 0 && items === undefined) {
      throw new BadRequestException('No fields to update');
    }

    // Atomic conditional guard — re-checks DRAFT at write time, not just at
    // the read above, closing the race against a concurrent complete()
    // claim (see design review, "update() has no atomic status guard").
    // Postgres holds a row lock on a successful UPDATE for the rest of
    // this transaction, so once this guard lands, a concurrent
    // claimProcessing() blocks until we commit and then sees our result;
    // if claimProcessing() already committed first, this guard matches
    // zero rows and we skip the item replacement entirely — a lost race
    // never touches item rows, per the requirement that an update must
    // never delete/recreate items after a completion claim has succeeded.
    const guardedCount = await this.prisma.$transaction(async (tx) => {
      const guard = await tx.unbuildOrder.updateMany({
        where: { id, tenantId: actor.tenantId, status: 'DRAFT' },
        data,
      });
      if (guard.count === 1 && items) {
        await tx.unbuildOrderItem.deleteMany({ where: { unbuildOrderId: id } });
        await tx.unbuildOrder.update({
          where: { id },
          data: { items: { create: items.map((item) => item.data) } },
        });
      }
      return guard.count;
    });

    if (guardedCount === 0) {
      throw new ConflictException(
        'Unbuild order status changed concurrently; reload and try again',
      );
    }
    return toUnbuildOrderResponse(await this.requireOrder(actor, id));
  }

  async cancel(actor: ActorContext, id: string) {
    const result = await this.prisma.unbuildOrder.updateMany({
      where: { id, tenantId: actor.tenantId, status: 'DRAFT' },
      data: { status: 'CANCELLED' },
    });
    if (result.count === 0) {
      await this.requireOrder(actor, id);
      throw new ConflictException('Only a DRAFT unbuild order can be cancelled');
    }
    return toUnbuildOrderResponse(await this.requireOrder(actor, id));
  }

  /**
   * DRAFT -> PROCESSING -> DONE, never DRAFT -> DONE directly. See design
   * report "Concurrency and recovery": PROCESSING is an atomic claim (same
   * updateMany + count-check convention as every other lifecycle transition
   * in this codebase), fenced by a fresh processingToken so a late response
   * from a superseded attempt can never overwrite a reclaiming attempt's
   * result. DONE is written only after inventory-service's posting call
   * has returned success.
   */
  async complete(actor: ActorContext, id: string) {
    const myToken = randomUUID();
    await this.claimProcessing(actor, id, myToken);

    let order: UnbuildOrderWithItems;
    try {
      order = await this.requireOrder(actor, id);
      await this.revalidateForCompletion(actor, order);
    } catch (error) {
      await this.revertToDraft(actor, id, myToken);
      throw error;
    }

    let postingResult: UnbuildPostingResult;
    try {
      postingResult = await this.inventoryUnbuild.post(actor, {
        referenceId: order.id,
        warehouseId: order.warehouseId,
        finishedGood: { productId: order.productId, quantity: quantityToString(order.quantity) },
        components: order.items.map((item) => ({
          productId: item.componentProductId,
          quantity: quantityToString(item.quantity),
        })),
      });
    } catch (error) {
      if (this.isDefiniteRejection(error)) {
        await this.revertToDraft(actor, id, myToken);
      }
      // Ambiguous failure (network error, timeout, 5xx) — deliberately left
      // PROCESSING. The posting call above is idempotent on order.id, so a
      // retry (immediate, or once the staleness window elapses) resolves
      // this safely either way: if inventory-service never committed, the
      // retry performs the real posting; if it did commit but this
      // response was lost, the retry replays the same result.
      throw error;
    }

    return this.confirmCompletion(actor, id, myToken, order, postingResult);
  }

  private async confirmCompletion(
    actor: ActorContext,
    id: string,
    myToken: string,
    order: UnbuildOrderWithItems,
    postingResult: UnbuildPostingResult,
  ) {
    const movementIdByProductId = new Map(
      postingResult.componentMovements.map((m) => [m.productId, m.id]),
    );

    const updateCount = await this.prisma.$transaction(async (tx) => {
      const result = await tx.unbuildOrder.updateMany({
        where: { id, tenantId: actor.tenantId, status: 'PROCESSING', processingToken: myToken },
        data: {
          status: 'DONE',
          completedAt: new Date(),
          completedBy: actor.userId,
          finishedGoodsMovementId: postingResult.finishedGoodsMovement.id,
          processingStartedAt: null,
          processingToken: null,
        },
      });
      if (result.count === 1) {
        for (const item of order.items) {
          const movementId = movementIdByProductId.get(item.componentProductId) ?? null;
          await tx.unbuildOrderItem.update({
            where: { id: item.id },
            data: { stockMovementId: movementId },
          });
        }
      }
      return result.count;
    });

    if (updateCount === 1) {
      return toUnbuildOrderResponse(await this.requireOrder(actor, id));
    }

    // Zero rows affected: another request (holding a newer fencing token)
    // may have already landed the same, correct completion. Never report
    // success without reloading and verifying that explicitly — see design
    // review, "PROCESSING -> DONE zero-rows handling".
    const reloaded = await this.requireOrder(actor, id);
    if (reloaded.status !== 'DONE') {
      throw new ConflictException(
        'Unbuild order completion could not be confirmed; reload and retry',
      );
    }
    const movementIdsMatch =
      reloaded.finishedGoodsMovementId === postingResult.finishedGoodsMovement.id &&
      reloaded.items.every(
        (item) => item.stockMovementId === movementIdByProductId.get(item.componentProductId),
      );
    if (!movementIdsMatch) {
      throw new ConflictException({
        code: 'UNBUILD_COMPLETION_MISMATCH',
        message:
          'Unbuild order reached DONE with different movement IDs than this request posted',
      });
    }
    return toUnbuildOrderResponse(reloaded);
  }

  private async claimProcessing(actor: ActorContext, id: string, token: string): Promise<void> {
    const claimed = await this.prisma.unbuildOrder.updateMany({
      where: {
        id,
        tenantId: actor.tenantId,
        OR: [
          { status: 'DRAFT' },
          {
            status: 'PROCESSING',
            processingStartedAt: { lt: new Date(Date.now() - STALE_PROCESSING_MS) },
          },
        ],
      },
      data: { status: 'PROCESSING', processingStartedAt: new Date(), processingToken: token },
    });
    if (claimed.count === 0) {
      await this.requireOrder(actor, id);
      throw new ConflictException(
        'Unbuild order is already being completed, not DRAFT, or already finished',
      );
    }
  }

  private async revertToDraft(actor: ActorContext, id: string, token: string): Promise<void> {
    await this.prisma.unbuildOrder.updateMany({
      where: { id, tenantId: actor.tenantId, status: 'PROCESSING', processingToken: token },
      data: { status: 'DRAFT', processingStartedAt: null, processingToken: null },
    });
  }

  private isDefiniteRejection(error: unknown): boolean {
    return (
      error instanceof ConflictException ||
      error instanceof BadRequestException ||
      error instanceof NotFoundException
    );
  }

  /**
   * Re-validates BOM ownership/historical-activation and base-unit UOM
   * compatibility against CURRENT inventory data — never trusted from this
   * order's own (possibly stale) snapshot. See design report, "BOM and UOM
   * validation".
   */
  private async revalidateForCompletion(
    actor: ActorContext,
    order: UnbuildOrderWithItems,
  ): Promise<void> {
    await this.requireBomForUnbuild(actor, order.bomId, order.productId);

    const product = await this.inventoryProducts.getProductDetail(actor, order.productId);
    if (!product.isActive) throw new ConflictException('Product is not active');
    if (product.base.unitOfMeasureId !== order.unitOfMeasureId) {
      throw new BadRequestException(
        `Finished good unit of measure is no longer the base unit for ${product.sku}`,
      );
    }

    await this.validateWarehouse(actor, order.warehouseId);

    for (const item of order.items) {
      const component = await this.inventoryProducts.getProductDetail(
        actor,
        item.componentProductId,
      );
      if (component.base.unitOfMeasureId !== item.unitOfMeasureId) {
        throw new BadRequestException(
          `Component unit of measure is no longer the base unit for ${component.sku}`,
        );
      }
    }
  }

  private async requireOrder(actor: ActorContext, id: string): Promise<UnbuildOrderWithItems> {
    const row = await this.prisma.unbuildOrder.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: { items: true },
    });
    if (!row) throw new NotFoundException('Unbuild order not found');
    return row;
  }

  private async requireManufacturableProduct(
    actor: ActorContext,
    productId: string,
  ): Promise<InventoryProductDetail> {
    const product = await this.inventoryProducts.getProductDetail(actor, productId);
    if (!product.isActive) throw new ConflictException('Product is not active');
    if (!product.trackInventory) throw new ConflictException('Product is not inventory-tracked');
    return product;
  }

  /**
   * bom.status != 'DRAFT' is sufficient to mean "was activated at some
   * point": activate() only ever runs from DRAFT or INACTIVE, and
   * deactivate() (plus activate()'s own auto-supersede of the previously
   * ACTIVE version) only ever moves ACTIVE -> INACTIVE — there is no code
   * path that reaches INACTIVE from DRAFT. Unlike ProductionOrdersService,
   * which requires the CURRENT version to be ACTIVE, Unbuild must also
   * accept a superseded (INACTIVE) version for historical traceability —
   * see design report, "BOM and UOM validation".
   */
  private async requireBomForUnbuild(
    actor: ActorContext,
    bomId: string,
    productId: string,
  ): Promise<BomWithItems> {
    const bom = await this.prisma.bom.findFirst({
      where: { id: bomId, tenantId: actor.tenantId },
      include: { items: true },
    });
    if (!bom) throw new NotFoundException('BOM not found');
    if (bom.parentProductId !== productId) {
      throw new ConflictException('Selected BOM does not belong to the selected product');
    }
    if (bom.status === 'DRAFT') {
      throw new ConflictException('Selected BOM was never activated');
    }
    return bom;
  }

  /**
   * Same scale formula as ProductionOrdersService.defaultItemsFromBom():
   * quantity / bom.bomQuantity applied uniformly to every BOM item. Scrap
   * is deliberately ignored on return (per the approved design) — scrap
   * represents material already consumed/discarded during the original
   * build, never incorporated into the finished product, so unbuilding can
   * only recover the full theoretical requirement.
   */
  private defaultItemsFromBom(
    actor: ActorContext,
    bom: BomWithItems,
    quantity: Prisma.Decimal,
  ): MappedItem[] {
    const scale = quantity.div(bom.bomQuantity);
    return bom.items.map((item) => ({
      componentProductId: item.componentProductId,
      data: {
        tenantId: actor.tenantId,
        componentProductId: item.componentProductId,
        componentProductSku: item.componentProductSku,
        componentProductName: item.componentProductName,
        quantity: item.quantity.mul(scale),
        unitOfMeasureId: item.unitOfMeasureId,
        uomCode: item.uomCode,
        uomName: item.uomName,
        sequence: item.sequence,
      },
    }));
  }

  private async validateWarehouse(actor: ActorContext, warehouseId: string): Promise<void> {
    const warehouse = await this.inventoryWarehouses.getWarehouseDetail(actor, warehouseId);
    if (!warehouse.isActive) throw new ConflictException('Selected warehouse is not active');
  }

  /**
   * Base-unit-only, unlike ProductionOrdersService.resolveUom() which also
   * accepts a ProductUnit alternative. Stock has no UOM dimension and this
   * codebase has no quantity-conversion math anywhere, so every quantity
   * that reaches inventory-service's Stock table must already be
   * expressed in the product's base unit — see design report, "Product
   * costPrice vs ProductUnit.costPrice" for why this also removes any
   * ambiguity from the component valuation weighting.
   */
  private resolveBaseUom(
    product: InventoryProductDetail,
    unitOfMeasureId: string,
  ): { unitOfMeasureId: string; code: string; name: string } {
    if (product.base.unitOfMeasureId !== unitOfMeasureId) {
      throw new BadRequestException(`Unit of measure must be the base unit for ${product.sku}`);
    }
    return product.base;
  }

  private async nextOrderNumber(tenantId: string): Promise<string> {
    const count = await this.prisma.unbuildOrder.count({ where: { tenantId } });
    return `UB-${String(count + 1).padStart(6, '0')}`;
  }
}
