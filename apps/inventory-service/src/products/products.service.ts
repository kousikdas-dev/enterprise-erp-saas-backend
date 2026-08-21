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
        },
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

  async list(actor: ActorContext) {
    const rows = await this.prisma.product.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { sku: 'asc' },
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
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }
    try {
      const row = await this.prisma.product.update({
        where: { id },
        data,
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
}
