import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import {
  Bom,
  Prisma,
  ProductionOrder,
  ProductionOrderStatus,
} from '../../generated/prisma-client';
import { ActorContext } from '../auth/actor-context';
import { parsePositiveDecimal } from '../common/decimal';
import {
  InventoryProductClient,
  InventoryProductDetail,
} from '../inventory/inventory-product.client';
import { InventoryWarehouseClient } from '../inventory/inventory-warehouse.client';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueConstraintError } from '../prisma/prisma-errors';
import { toProductionOrderResponse } from './dto/production-order-response';
import {
  CreateProductionOrderDto,
  UpdateProductionOrderDto,
} from './dto/production-order.dto';

const MAX_NUMBER_RETRIES = 5;

export interface ListProductionOrdersQuery {
  search?: string;
  status?: ProductionOrderStatus;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class ProductionOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryProducts: InventoryProductClient,
    private readonly inventoryWarehouses: InventoryWarehouseClient,
  ) {}

  async create(actor: ActorContext, dto: CreateProductionOrderDto) {
    const product = await this.requireManufacturableProduct(
      actor,
      dto.productId,
      'Product',
    );
    const bom = await this.requireActiveBomForProduct(
      actor,
      dto.bomId,
      dto.productId,
    );
    const plannedQuantity = parsePositiveDecimal(dto.plannedQuantity);
    const outputUom = this.resolveUom(
      product,
      dto.outputUnitOfMeasureId,
      'product',
    );
    this.assertPlannedDateRange(dto.plannedStartDate, dto.plannedEndDate);
    if (dto.warehouseId) {
      await this.validateWarehouse(actor, dto.warehouseId);
    }

    for (let attempt = 0; attempt < MAX_NUMBER_RETRIES; attempt += 1) {
      const orderNumber = await this.nextOrderNumber(actor.tenantId);
      try {
        const row = await this.prisma.productionOrder.create({
          data: {
            tenantId: actor.tenantId,
            orderNumber,
            productId: dto.productId,
            productSku: product.sku,
            productName: product.name,
            bomId: dto.bomId,
            bomVersion: bom.version,
            routingId: null,
            routingVersion: null,
            plannedQuantity,
            outputUnitOfMeasureId: outputUom.unitOfMeasureId,
            outputUomCode: outputUom.code,
            outputUomName: outputUom.name,
            orderDate: new Date(dto.orderDate),
            plannedStartDate: dto.plannedStartDate
              ? new Date(dto.plannedStartDate)
              : null,
            plannedEndDate: dto.plannedEndDate
              ? new Date(dto.plannedEndDate)
              : null,
            warehouseId: dto.warehouseId ?? null,
            priority: dto.priority ?? 'NORMAL',
            status: 'DRAFT',
            notes: dto.notes?.trim() || null,
          },
        });
        return toProductionOrderResponse(row);
      } catch (error) {
        if (isUniqueConstraintError(error) && attempt < MAX_NUMBER_RETRIES - 1) {
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException('Could not allocate a production order number');
  }

  async list(actor: ActorContext, query: ListProductionOrdersQuery = {}) {
    const page = query.page && query.page > 0 ? Math.floor(query.page) : 1;
    const pageSize =
      query.pageSize && query.pageSize > 0
        ? Math.min(Math.floor(query.pageSize), 100)
        : 20;

    const where: Prisma.ProductionOrderWhereInput = {
      tenantId: actor.tenantId,
    };
    if (query.status) {
      where.status = query.status;
    }
    if (query.dateFrom || query.dateTo) {
      where.orderDate = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }
    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { productSku: { contains: search, mode: 'insensitive' } },
        { productName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.productionOrder.count({ where }),
      this.prisma.productionOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map(toProductionOrderResponse),
      total,
      page,
      pageSize,
    };
  }

  async getById(actor: ActorContext, id: string) {
    return toProductionOrderResponse(await this.requireOrder(actor, id));
  }

  async update(actor: ActorContext, id: string, dto: UpdateProductionOrderDto) {
    const order = await this.requireOrder(actor, id);
    if (
      order.status === 'COMPLETED' ||
      order.status === 'CANCELLED' ||
      order.status === 'CLOSED'
    ) {
      throw new ConflictException(
        `A ${order.status} production order cannot be edited`,
      );
    }

    const structuralFieldProvided =
      dto.productId !== undefined ||
      dto.bomId !== undefined ||
      dto.plannedQuantity !== undefined ||
      dto.outputUnitOfMeasureId !== undefined;
    if (structuralFieldProvided && order.status !== 'DRAFT') {
      throw new ConflictException(
        'Product, BOM, planned quantity, and output UOM can only be changed while DRAFT',
      );
    }
    if (dto.productId !== undefined && dto.outputUnitOfMeasureId === undefined) {
      throw new BadRequestException(
        'outputUnitOfMeasureId is required when changing product',
      );
    }

    const data: Prisma.ProductionOrderUpdateInput = {};

    if (dto.productId !== undefined || dto.bomId !== undefined) {
      const effectiveProductId = dto.productId ?? order.productId;
      const effectiveBomId = dto.bomId ?? order.bomId;
      const product = await this.requireManufacturableProduct(
        actor,
        effectiveProductId,
        'Product',
      );
      const bom = await this.requireActiveBomForProduct(
        actor,
        effectiveBomId,
        effectiveProductId,
      );
      data.productId = effectiveProductId;
      data.productSku = product.sku;
      data.productName = product.name;
      data.bomId = effectiveBomId;
      data.bomVersion = bom.version;

      if (dto.outputUnitOfMeasureId !== undefined) {
        const outputUom = this.resolveUom(
          product,
          dto.outputUnitOfMeasureId,
          'product',
        );
        data.outputUnitOfMeasureId = outputUom.unitOfMeasureId;
        data.outputUomCode = outputUom.code;
        data.outputUomName = outputUom.name;
      }
    } else if (dto.outputUnitOfMeasureId !== undefined) {
      const product = await this.requireManufacturableProduct(
        actor,
        order.productId,
        'Product',
      );
      const outputUom = this.resolveUom(
        product,
        dto.outputUnitOfMeasureId,
        'product',
      );
      data.outputUnitOfMeasureId = outputUom.unitOfMeasureId;
      data.outputUomCode = outputUom.code;
      data.outputUomName = outputUom.name;
    }

    if (dto.plannedQuantity !== undefined) {
      data.plannedQuantity = parsePositiveDecimal(dto.plannedQuantity);
    }

    const plannedStartDate =
      dto.plannedStartDate !== undefined
        ? new Date(dto.plannedStartDate)
        : order.plannedStartDate;
    const plannedEndDate =
      dto.plannedEndDate !== undefined
        ? new Date(dto.plannedEndDate)
        : order.plannedEndDate;
    this.assertPlannedDateRange(
      plannedStartDate?.toISOString(),
      plannedEndDate?.toISOString(),
    );
    if (dto.plannedStartDate !== undefined) data.plannedStartDate = plannedStartDate;
    if (dto.plannedEndDate !== undefined) data.plannedEndDate = plannedEndDate;
    if (dto.orderDate !== undefined) data.orderDate = new Date(dto.orderDate);

    if (dto.warehouseId !== undefined) {
      await this.validateWarehouse(actor, dto.warehouseId);
      data.warehouseId = dto.warehouseId;
    }
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.notes !== undefined) data.notes = dto.notes.trim() || null;

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }

    const row = await this.prisma.productionOrder.update({
      where: { id },
      data,
    });
    return toProductionOrderResponse(row);
  }

  async remove(
    actor: ActorContext,
    id: string,
  ): Promise<{ id: string; removed: boolean }> {
    const order = await this.requireOrder(actor, id);
    if (order.status !== 'DRAFT') {
      throw new ConflictException('Only DRAFT production orders can be deleted');
    }
    await this.prisma.productionOrder.delete({ where: { id } });
    return { id, removed: true };
  }

  async plan(actor: ActorContext, id: string) {
    const order = await this.requireOrder(actor, id);
    if (order.status !== 'DRAFT') {
      throw new ConflictException('Only DRAFT production orders can be planned');
    }
    await this.requireManufacturableProduct(actor, order.productId, 'Product');
    await this.requireActiveBomForProduct(actor, order.bomId, order.productId);
    return toProductionOrderResponse(
      await this.transition(actor, id, ['DRAFT'], 'PLANNED'),
    );
  }

  async release(actor: ActorContext, id: string) {
    const order = await this.requireOrder(actor, id);
    if (order.status !== 'PLANNED') {
      throw new ConflictException(
        'Only PLANNED production orders can be released',
      );
    }
    await this.requireManufacturableProduct(actor, order.productId, 'Product');
    await this.requireActiveBomForProduct(actor, order.bomId, order.productId);
    if (order.warehouseId) {
      await this.validateWarehouse(actor, order.warehouseId);
    }
    return toProductionOrderResponse(
      await this.transition(actor, id, ['PLANNED'], 'RELEASED'),
    );
  }

  async start(actor: ActorContext, id: string) {
    const order = await this.requireOrder(actor, id);
    if (order.status !== 'RELEASED') {
      throw new ConflictException(
        'Only RELEASED production orders can be started',
      );
    }
    return toProductionOrderResponse(
      await this.transition(actor, id, ['RELEASED'], 'IN_PROGRESS'),
    );
  }

  /**
   * Deliberately not implemented: recording a production order as COMPLETED
   * requires actual produced/scrap/rejected quantities from a Production
   * Receipt, which this phase does not implement. Refusing outright is
   * preferable to fabricating a completed quantity that was never received.
   * The IN_PROGRESS status check still runs so the error is meaningful
   * (wrong-state orders get the usual ConflictException, not this notice).
   */
  async complete(actor: ActorContext, id: string): Promise<never> {
    const order = await this.requireOrder(actor, id);
    if (order.status !== 'IN_PROGRESS') {
      throw new ConflictException(
        'Only IN_PROGRESS production orders can be completed',
      );
    }
    throw new NotImplementedException(
      'Completing a production order requires Production Receipt, which is not implemented yet',
    );
  }

  async cancel(actor: ActorContext, id: string) {
    const order = await this.requireOrder(actor, id);
    const cancellableFrom: ProductionOrderStatus[] = ['DRAFT', 'PLANNED', 'RELEASED'];
    if (!cancellableFrom.includes(order.status)) {
      throw new ConflictException(
        'Production order cannot be cancelled once IN_PROGRESS or later',
      );
    }
    return toProductionOrderResponse(
      await this.transition(actor, id, cancellableFrom, 'CANCELLED'),
    );
  }

  async close(actor: ActorContext, id: string) {
    const order = await this.requireOrder(actor, id);
    const closableFrom: ProductionOrderStatus[] = ['COMPLETED', 'CANCELLED'];
    if (!closableFrom.includes(order.status)) {
      throw new ConflictException(
        'Only COMPLETED or CANCELLED production orders can be closed',
      );
    }
    return toProductionOrderResponse(
      await this.transition(actor, id, closableFrom, 'CLOSED'),
    );
  }

  private async requireOrder(
    actor: ActorContext,
    id: string,
  ): Promise<ProductionOrder> {
    const row = await this.prisma.productionOrder.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!row) throw new NotFoundException('Production order not found');
    return row;
  }

  /**
   * Applies a lifecycle transition only if the order is still in one of the
   * expected `from` statuses at write time. `updateMany`'s WHERE clause
   * (including `status: { in: from }`) is evaluated atomically by Postgres,
   * so if a concurrent request already moved the order out of `from`
   * between our read and this write, `count` comes back 0 and the loser
   * gets a clear conflict instead of silently overwriting the winner's
   * transition (see task requirement on concurrent lifecycle protection).
   */
  private async transition(
    actor: ActorContext,
    id: string,
    from: ProductionOrderStatus[],
    to: ProductionOrderStatus,
  ): Promise<ProductionOrder> {
    const result = await this.prisma.productionOrder.updateMany({
      where: { id, tenantId: actor.tenantId, status: { in: from } },
      data: { status: to },
    });
    if (result.count === 0) {
      throw new ConflictException(
        'Production order status changed concurrently; reload and try again',
      );
    }
    return this.requireOrder(actor, id);
  }

  private async nextOrderNumber(tenantId: string): Promise<string> {
    const count = await this.prisma.productionOrder.count({
      where: { tenantId },
    });
    return `MO-${String(count + 1).padStart(6, '0')}`;
  }

  private assertPlannedDateRange(
    plannedStartDate?: string | null,
    plannedEndDate?: string | null,
  ): void {
    if (!plannedStartDate || !plannedEndDate) return;
    if (
      new Date(plannedEndDate).getTime() < new Date(plannedStartDate).getTime()
    ) {
      throw new BadRequestException(
        'plannedEndDate must not be before plannedStartDate',
      );
    }
  }

  private async requireManufacturableProduct(
    actor: ActorContext,
    productId: string,
    label: string,
  ): Promise<InventoryProductDetail> {
    const product = await this.inventoryProducts.getProductDetail(
      actor,
      productId,
    );
    if (!product.isActive) {
      throw new ConflictException(`${label} is not active`);
    }
    if (!product.trackInventory) {
      throw new ConflictException(`${label} is not inventory-tracked`);
    }
    return product;
  }

  private async requireActiveBomForProduct(
    actor: ActorContext,
    bomId: string,
    productId: string,
  ): Promise<Bom> {
    const bom = await this.prisma.bom.findFirst({
      where: { id: bomId, tenantId: actor.tenantId },
    });
    if (!bom) {
      throw new NotFoundException('BOM not found');
    }
    if (bom.parentProductId !== productId) {
      throw new ConflictException(
        'Selected BOM does not belong to the selected product',
      );
    }
    if (bom.status !== 'ACTIVE') {
      throw new ConflictException('Selected BOM must be ACTIVE');
    }
    return bom;
  }

  private async validateWarehouse(
    actor: ActorContext,
    warehouseId: string,
  ): Promise<void> {
    const warehouse = await this.inventoryWarehouses.getWarehouseDetail(
      actor,
      warehouseId,
    );
    if (!warehouse.isActive) {
      throw new ConflictException('Selected warehouse is not active');
    }
  }

  private resolveUom(
    product: InventoryProductDetail,
    unitOfMeasureId: string,
    label: string,
  ): { unitOfMeasureId: string; code: string; name: string } {
    if (product.base.unitOfMeasureId === unitOfMeasureId) {
      return product.base;
    }
    const alternative = product.alternatives.find(
      (alt) => alt.unitOfMeasureId === unitOfMeasureId,
    );
    if (!alternative) {
      throw new BadRequestException(
        `Unit of measure is not valid for ${label} ${product.sku}`,
      );
    }
    return alternative;
  }
}
