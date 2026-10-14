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

/**
 * `isUniqueConstraintError` only confirms a P2002 fired — it says nothing
 * about *which* unique index. Scoped locally to this service (rather than
 * widening the shared helper other services rely on for their own distinct
 * messages) so only an actual `sku` constraint violation is ever reported
 * as "SKU already exists"; any other unique-index violation reachable from
 * these writes (e.g. ProductAttributeValue's per-product-per-value index)
 * falls through to a generic conflict instead of being mislabeled.
 */
function isSkuUniqueConstraintError(error: unknown): boolean {
  if (!isUniqueConstraintError(error)) {
    return false;
  }
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  if (Array.isArray(target)) {
    return target.includes('sku');
  }
  if (typeof target === 'string') {
    return target.toLowerCase().includes('sku');
  }
  return false;
}

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
      await this.assertValidTemplateAssignment(actor, dto.templateProductId);
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
      if (isSkuUniqueConstraintError(error)) {
        throw new ConflictException('SKU already exists in this tenant');
      }
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('A related record already exists');
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
    if (dto.templateProductId !== undefined && dto.templateProductId !== null) {
      await this.assertValidTemplateAssignment(actor, dto.templateProductId, id);
    }
    if (dto.attributeValueIds !== undefined) {
      await this.requireAttributeValues(actor, dto.attributeValueIds);
    }
    const data: Prisma.ProductUncheckedUpdateInput = {};
    if (dto.sku !== undefined) data.sku = dto.sku.trim().toUpperCase();
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined)
      data.description = dto.description === null ? null : dto.description.trim() || null;
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
    if (dto.barcode !== undefined)
      data.barcode = dto.barcode === null ? null : dto.barcode.trim() || null;
    if (dto.note !== undefined)
      data.note = dto.note === null ? null : dto.note.trim() || null;
    // `null` here is an explicit "detach this variant"; a validated string
    // reassigns it — assertValidTemplateAssignment() above already checked
    // it without ever querying Prisma with `id: null` (the crash this
    // replaces).
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
      if (isSkuUniqueConstraintError(error)) {
        throw new ConflictException('SKU already exists in this tenant');
      }
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('A related record already exists');
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

  /**
   * Enforces the one-level variant nesting rule for `productId` (omitted on
   * create) adopting `candidateTemplateId` as its template:
   *   - `productId` can never be `candidateTemplateId`, directly or by
   *     walking the candidate's ancestor chain back to it (cycle guard).
   *   - the candidate must resolve, by walking its own ancestor chain (not
   *     just reading one field), to a genuine top-level product — a
   *     real walk rather than a one-hop peek, so it keeps working if this
   *     module's nesting-depth rule is ever relaxed, matching the discipline
   *     already used by BillOfMaterialsService.assertNoCycle /
   *     AccountsService.assertNoCycle elsewhere in this codebase.
   *   - (update only) `productId` must not already have variants of its
   *     own — giving a product-with-children a template would silently
   *     turn those children into second-level variants, the one direction
   *     the original single-hop check on the candidate side never covered.
   */
  private async assertValidTemplateAssignment(
    actor: ActorContext,
    candidateTemplateId: string,
    productId?: string,
  ): Promise<void> {
    if (productId && candidateTemplateId === productId) {
      throw new ConflictException('A product cannot be a variant of itself');
    }

    const visited = new Set<string>();
    let currentId: string | null = candidateTemplateId;
    let isTopLevelCandidate = false;
    let firstHop = true;
    while (currentId) {
      if (productId && currentId === productId) {
        throw new ConflictException(
          'This would create a circular variant relationship',
        );
      }
      if (visited.has(currentId)) {
        throw new ConflictException(
          'This would create a circular variant relationship',
        );
      }
      visited.add(currentId);

      const link: { templateProductId: string | null } | null =
        await this.prisma.product.findFirst({
          where: { id: currentId, tenantId: actor.tenantId },
          select: { templateProductId: true },
        });
      if (!link) {
        throw new NotFoundException('Template product not found');
      }
      if (firstHop) {
        isTopLevelCandidate = link.templateProductId === null;
        firstHop = false;
      }
      currentId = link.templateProductId;
    }

    if (!isTopLevelCandidate) {
      throw new ConflictException(
        'Selected template is itself a variant; a product can only be a variant of a top-level product',
      );
    }

    if (productId) {
      const childCount = await this.prisma.product.count({
        where: { tenantId: actor.tenantId, templateProductId: productId },
      });
      if (childCount > 0) {
        throw new ConflictException(
          'This product already has variants and cannot itself become a variant',
        );
      }
    }
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
