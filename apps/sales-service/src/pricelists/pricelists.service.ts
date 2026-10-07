import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { ActorContext, RequestAuditMeta } from '../auth/actor-context';
import { parseMoney, parsePercent } from '../common/decimal';
import { Prisma } from '../../generated/prisma-client';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueConstraintError } from '../prisma/prisma-errors';
import {
  toPricelistItemResponse,
  toPricelistResponse,
} from './dto/pricelist-response';
import { CreatePricelistDto, UpdatePricelistDto } from './dto/pricelist.dto';
import {
  CreatePricelistItemDto,
  UpdatePricelistItemDto,
} from './dto/pricelist-item.dto';

@Injectable()
export class PricelistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: IdentityAuditClient,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreatePricelistDto,
    request?: RequestAuditMeta,
  ) {
    const itemsData = (dto.items ?? []).map((item, index) =>
      this.buildItemData(actor, item, index),
    );
    try {
      const row = await this.prisma.pricelist.create({
        data: {
          tenantId: actor.tenantId,
          name: dto.name.trim(),
          items: itemsData.length ? { create: itemsData } : undefined,
        },
        include: { items: { orderBy: { sequence: 'asc' } } },
      });
      await this.audit.record({
        actor,
        action: 'pricelist.created',
        resource: 'pricelist',
        resourceId: row.id,
        metadata: { name: row.name },
        request,
      });
      return toPricelistResponse(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Pricelist name already exists in this tenant',
        );
      }
      throw error;
    }
  }

  async list(actor: ActorContext) {
    const rows = await this.prisma.pricelist.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { items: true } } },
    });
    return { items: rows.map(toPricelistResponse) };
  }

  async getById(actor: ActorContext, id: string) {
    const row = await this.prisma.pricelist.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: { items: { orderBy: { sequence: 'asc' } } },
    });
    if (!row) throw new NotFoundException('Pricelist not found');
    return toPricelistResponse(row);
  }

  async update(
    actor: ActorContext,
    id: string,
    dto: UpdatePricelistDto,
    request?: RequestAuditMeta,
  ) {
    await this.require(actor, id);
    const data: { name?: string; isActive?: boolean } = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }
    try {
      const row = await this.prisma.pricelist.update({
        where: { id },
        data,
        include: { items: { orderBy: { sequence: 'asc' } } },
      });
      await this.audit.record({
        actor,
        action: 'pricelist.updated',
        resource: 'pricelist',
        resourceId: row.id,
        metadata: data,
        request,
      });
      return toPricelistResponse(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Pricelist name already exists in this tenant',
        );
      }
      throw error;
    }
  }

  async addItem(
    actor: ActorContext,
    pricelistId: string,
    dto: CreatePricelistItemDto,
    request?: RequestAuditMeta,
  ) {
    await this.require(actor, pricelistId);
    const data = this.buildItemData(actor, dto, 0);
    const row = await this.prisma.pricelistItem.create({
      data: { ...data, pricelistId },
    });
    await this.audit.record({
      actor,
      action: 'pricelist_item.created',
      resource: 'pricelist_item',
      resourceId: row.id,
      metadata: { pricelistId },
      request,
    });
    return toPricelistItemResponse(row);
  }

  async updateItem(
    actor: ActorContext,
    pricelistId: string,
    itemId: string,
    dto: UpdatePricelistItemDto,
    request?: RequestAuditMeta,
  ) {
    await this.require(actor, pricelistId);
    const existing = await this.requireItem(actor, pricelistId, itemId);
    const merged: CreatePricelistItemDto = {
      applyOn: dto.applyOn ?? existing.applyOn,
      categoryId: dto.categoryId ?? existing.categoryId ?? undefined,
      productId: dto.productId ?? existing.productId ?? undefined,
      computeMethod: dto.computeMethod ?? existing.computeMethod,
      fixedPrice:
        dto.fixedPrice ??
        (existing.fixedPrice ? existing.fixedPrice.toString() : undefined),
      discountPercent:
        dto.discountPercent ??
        (existing.discountPercent
          ? existing.discountPercent.toString()
          : undefined),
      minQuantity: dto.minQuantity ?? existing.minQuantity.toString(),
      validFrom: dto.validFrom,
      validTo: dto.validTo,
      sequence: dto.sequence ?? existing.sequence,
    };
    const data = this.buildItemData(actor, merged, existing.sequence);
    const row = await this.prisma.pricelistItem.update({
      where: { id: itemId },
      data,
    });
    await this.audit.record({
      actor,
      action: 'pricelist_item.updated',
      resource: 'pricelist_item',
      resourceId: row.id,
      metadata: { pricelistId },
      request,
    });
    return toPricelistItemResponse(row);
  }

  async removeItem(
    actor: ActorContext,
    pricelistId: string,
    itemId: string,
    request?: RequestAuditMeta,
  ) {
    await this.require(actor, pricelistId);
    await this.requireItem(actor, pricelistId, itemId);
    await this.prisma.pricelistItem.delete({ where: { id: itemId } });
    await this.audit.record({
      actor,
      action: 'pricelist_item.deleted',
      resource: 'pricelist_item',
      resourceId: itemId,
      metadata: { pricelistId },
      request,
    });
    return { pricelistId, id: itemId, removed: true as const };
  }

  /**
   * Validates applyOn/categoryId/productId and computeMethod/fixedPrice/discountPercent
   * pairings and converts decimal strings. categoryId/productId are soft references —
   * not validated against inventory-service (Product/Category live in a different
   * service's database), matching how Quotation/SalesOrder already reference them.
   */
  private buildItemData(
    actor: ActorContext,
    dto: CreatePricelistItemDto,
    defaultSequence: number,
  ): Prisma.PricelistItemUncheckedCreateWithoutPricelistInput {
    const applyOn = dto.applyOn ?? 'ALL_PRODUCTS';
    if (applyOn === 'CATEGORY' && !dto.categoryId) {
      throw new BadRequestException(
        'categoryId is required when applyOn is CATEGORY',
      );
    }
    if (applyOn === 'PRODUCT' && !dto.productId) {
      throw new BadRequestException(
        'productId is required when applyOn is PRODUCT',
      );
    }

    const computeMethod = dto.computeMethod ?? 'FIXED_PRICE';
    if (computeMethod === 'FIXED_PRICE' && dto.fixedPrice === undefined) {
      throw new BadRequestException(
        'fixedPrice is required when computeMethod is FIXED_PRICE',
      );
    }
    if (
      computeMethod === 'DISCOUNT_PERCENT' &&
      dto.discountPercent === undefined
    ) {
      throw new BadRequestException(
        'discountPercent is required when computeMethod is DISCOUNT_PERCENT',
      );
    }

    return {
      tenantId: actor.tenantId,
      applyOn,
      categoryId: applyOn === 'CATEGORY' ? dto.categoryId : null,
      productId: applyOn === 'PRODUCT' ? dto.productId : null,
      computeMethod,
      fixedPrice:
        computeMethod === 'FIXED_PRICE' && dto.fixedPrice !== undefined
          ? parseMoney(dto.fixedPrice)
          : null,
      discountPercent:
        computeMethod === 'DISCOUNT_PERCENT' && dto.discountPercent !== undefined
          ? parsePercent(dto.discountPercent)
          : null,
      minQuantity:
        dto.minQuantity !== undefined ? parseMoney(dto.minQuantity) : 0,
      validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
      validTo: dto.validTo ? new Date(dto.validTo) : null,
      sequence: dto.sequence ?? defaultSequence,
    };
  }

  private async require(actor: ActorContext, id: string) {
    const row = await this.prisma.pricelist.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!row) throw new NotFoundException('Pricelist not found');
    return row;
  }

  private async requireItem(
    actor: ActorContext,
    pricelistId: string,
    itemId: string,
  ) {
    const row = await this.prisma.pricelistItem.findFirst({
      where: { id: itemId, pricelistId, tenantId: actor.tenantId },
    });
    if (!row) throw new NotFoundException('Pricelist item not found');
    return row;
  }
}
