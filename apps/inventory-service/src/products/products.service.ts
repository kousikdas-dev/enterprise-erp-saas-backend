import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma-client';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { ActorContext, RequestAuditMeta } from '../auth/actor-context';
import { parseMoney } from '../common/decimal';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueConstraintError } from '../prisma/prisma-errors';
import { toProductResponse } from './dto/product-response';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';

/** Always include the attribute-value tags, with their attribute name, for the response mapper. */
const PRODUCT_INCLUDE = {
  attributeValues: {
    include: { attributeValue: { include: { attribute: true } } },
  },
} satisfies Prisma.ProductInclude;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: IdentityAuditClient,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreateProductDto,
    request?: RequestAuditMeta,
  ) {
    await this.requireCategory(actor, dto.categoryId);
    await this.requireUnit(actor, dto.unitOfMeasureId);
    if (dto.templateProductId !== undefined) {
      await this.requireTemplateProduct(actor, dto.templateProductId);
    }
    if (dto.attributeValueIds !== undefined) {
      await this.requireAttributeValues(actor, dto.attributeValueIds);
    }
    try {
      const row = await this.prisma.product.create({
        data: {
          tenantId: actor.tenantId,
          sku: dto.sku.trim().toUpperCase(),
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          categoryId: dto.categoryId,
          unitOfMeasureId: dto.unitOfMeasureId,
          sellingPrice: parseMoney(dto.sellingPrice),
          costPrice: parseMoney(dto.costPrice),
          productType: dto.productType,
          trackInventory: dto.trackInventory,
          barcode: dto.barcode?.trim() || null,
          note: dto.note?.trim() || null,
          templateProductId: dto.templateProductId ?? null,
          attributeValues: dto.attributeValueIds
            ? {
                create: dto.attributeValueIds.map((attributeValueId) => ({
                  tenantId: actor.tenantId,
                  attributeValueId,
                })),
              }
            : undefined,
        },
        include: PRODUCT_INCLUDE,
      });
      await this.audit.record({
        actor,
        action: 'product.created',
        resource: 'product',
        resourceId: row.id,
        metadata: { sku: row.sku, name: row.name },
        request,
      });
      return toProductResponse(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('SKU already exists in this tenant');
      }
      throw error;
    }
  }

  async list(actor: ActorContext, templateProductId?: string) {
    const rows = await this.prisma.product.findMany({
      where: {
        tenantId: actor.tenantId,
        ...(templateProductId ? { templateProductId } : {}),
      },
      orderBy: { sku: 'asc' },
      include: PRODUCT_INCLUDE,
    });
    return { items: rows.map(toProductResponse) };
  }

  async getById(actor: ActorContext, id: string) {
    return toProductResponse(await this.requireProduct(actor, id));
  }

  async update(
    actor: ActorContext,
    id: string,
    dto: UpdateProductDto,
    request?: RequestAuditMeta,
  ) {
    await this.requireProduct(actor, id);
    if (dto.categoryId) await this.requireCategory(actor, dto.categoryId);
    if (dto.unitOfMeasureId) await this.requireUnit(actor, dto.unitOfMeasureId);
    if (dto.templateProductId !== undefined) {
      if (dto.templateProductId === id) {
        throw new ConflictException('A product cannot be a variant of itself');
      }
      await this.requireTemplateProduct(actor, dto.templateProductId);
    }
    if (dto.attributeValueIds !== undefined) {
      await this.requireAttributeValues(actor, dto.attributeValueIds);
    }
    const data: Prisma.ProductUncheckedUpdateInput = {};
    if (dto.sku !== undefined) data.sku = dto.sku.trim().toUpperCase();
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined)
      data.description = dto.description.trim() || null;
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId;
    if (dto.unitOfMeasureId !== undefined)
      data.unitOfMeasureId = dto.unitOfMeasureId;
    if (dto.sellingPrice !== undefined)
      data.sellingPrice = parseMoney(dto.sellingPrice);
    if (dto.costPrice !== undefined) data.costPrice = parseMoney(dto.costPrice);
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.productType !== undefined) data.productType = dto.productType;
    if (dto.trackInventory !== undefined)
      data.trackInventory = dto.trackInventory;
    if (dto.barcode !== undefined) data.barcode = dto.barcode.trim() || null;
    if (dto.note !== undefined) data.note = dto.note.trim() || null;
    if (dto.templateProductId !== undefined)
      data.templateProductId = dto.templateProductId;
    if (Object.keys(data).length === 0 && dto.attributeValueIds === undefined) {
      throw new BadRequestException('No fields to update');
    }
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        if (dto.attributeValueIds !== undefined) {
          await tx.productAttributeValue.deleteMany({
            where: { productId: id },
          });
        }
        return tx.product.update({
          where: { id },
          data: {
            ...data,
            ...(dto.attributeValueIds !== undefined
              ? {
                  attributeValues: {
                    create: dto.attributeValueIds.map((attributeValueId) => ({
                      tenantId: actor.tenantId,
                      attributeValueId,
                    })),
                  },
                }
              : {}),
          },
          include: PRODUCT_INCLUDE,
        });
      });
      await this.audit.record({
        actor,
        action: 'product.updated',
        resource: 'product',
        resourceId: row.id,
        metadata: { sku: row.sku, name: row.name },
        request,
      });
      return toProductResponse(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('SKU already exists in this tenant');
      }
      throw error;
    }
  }

  private async requireProduct(actor: ActorContext, id: string) {
    const row = await this.prisma.product.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: PRODUCT_INCLUDE,
    });
    if (!row) throw new NotFoundException('Product not found');
    return row;
  }

  private async requireCategory(actor: ActorContext, id: string) {
    const row = await this.prisma.category.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!row) throw new NotFoundException('Category not found');
    return row;
  }

  private async requireUnit(actor: ActorContext, id: string) {
    const row = await this.prisma.unitOfMeasure.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!row) throw new NotFoundException('Unit of measure not found');
    return row;
  }

  /** The template itself must not already be a variant — only one level of variant nesting is allowed. */
  private async requireTemplateProduct(actor: ActorContext, id: string) {
    const row = await this.prisma.product.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!row) throw new NotFoundException('Template product not found');
    if (row.templateProductId) {
      throw new ConflictException(
        'Selected template is itself a variant; a product can only be a variant of a top-level product',
      );
    }
    return row;
  }

  private async requireAttributeValues(actor: ActorContext, ids: string[]) {
    if (ids.length === 0) return;
    const rows = await this.prisma.attributeValue.findMany({
      where: { id: { in: ids }, tenantId: actor.tenantId },
    });
    if (rows.length !== new Set(ids).size) {
      throw new BadRequestException('One or more attribute values were not found');
    }
  }
}
