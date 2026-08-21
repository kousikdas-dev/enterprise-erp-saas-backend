import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma-client';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { ActorContext, RequestAuditMeta } from '../auth/actor-context';
import { parseMoney, parsePositiveDecimal } from '../common/decimal';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueConstraintError } from '../prisma/prisma-errors';
import { toProductUnitResponse } from './dto/product-unit-response';
import {
  CreateProductUnitDto,
  UpdateProductUnitDto,
} from './dto/product-unit.dto';

@Injectable()
export class ProductUnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: IdentityAuditClient,
  ) {}

  async list(actor: ActorContext, productId: string) {
    await this.requireProduct(actor, productId);
    const rows = await this.prisma.productUnit.findMany({
      where: { tenantId: actor.tenantId, productId },
      orderBy: { createdAt: 'asc' },
    });
    return { items: rows.map(toProductUnitResponse) };
  }

  async create(
    actor: ActorContext,
    productId: string,
    dto: CreateProductUnitDto,
    request?: RequestAuditMeta,
  ) {
    const product = await this.requireProduct(actor, productId);
    await this.requireUnit(actor, dto.unitOfMeasureId);
    this.assertNotBaseUnit(product.unitOfMeasureId, dto.unitOfMeasureId);
    const conversionFactor = parsePositiveDecimal(dto.conversionFactor);
    try {
      const row = await this.prisma.productUnit.create({
        data: {
          tenantId: actor.tenantId,
          productId,
          unitOfMeasureId: dto.unitOfMeasureId,
          conversionFactor,
          sellingPrice: parseMoney(dto.sellingPrice),
          costPrice: parseMoney(dto.costPrice),
          isActive: dto.isActive ?? true,
        },
      });
      await this.audit.record({
        actor,
        action: 'product_unit.created',
        resource: 'product_unit',
        resourceId: row.id,
        metadata: { productId, unitOfMeasureId: row.unitOfMeasureId },
        request,
      });
      return toProductUnitResponse(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'This unit is already added to the product',
        );
      }
      throw error;
    }
  }

  async update(
    actor: ActorContext,
    productId: string,
    id: string,
    dto: UpdateProductUnitDto,
    request?: RequestAuditMeta,
  ) {
    const product = await this.requireProduct(actor, productId);
    await this.requireProductUnit(actor, productId, id);
    if (dto.unitOfMeasureId !== undefined) {
      await this.requireUnit(actor, dto.unitOfMeasureId);
      this.assertNotBaseUnit(product.unitOfMeasureId, dto.unitOfMeasureId);
    }
    const data: Prisma.ProductUnitUncheckedUpdateInput = {};
    if (dto.unitOfMeasureId !== undefined)
      data.unitOfMeasureId = dto.unitOfMeasureId;
    if (dto.conversionFactor !== undefined)
      data.conversionFactor = parsePositiveDecimal(dto.conversionFactor);
    if (dto.sellingPrice !== undefined)
      data.sellingPrice = parseMoney(dto.sellingPrice);
    if (dto.costPrice !== undefined) data.costPrice = parseMoney(dto.costPrice);
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }
    try {
      const row = await this.prisma.productUnit.update({
        where: { id },
        data,
      });
      await this.audit.record({
        actor,
        action: 'product_unit.updated',
        resource: 'product_unit',
        resourceId: row.id,
        metadata: { productId, unitOfMeasureId: row.unitOfMeasureId },
        request,
      });
      return toProductUnitResponse(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'This unit is already added to the product',
        );
      }
      throw error;
    }
  }

  async remove(
    actor: ActorContext,
    productId: string,
    id: string,
    request?: RequestAuditMeta,
  ) {
    await this.requireProduct(actor, productId);
    await this.requireProductUnit(actor, productId, id);
    await this.prisma.productUnit.delete({ where: { id } });
    await this.audit.record({
      actor,
      action: 'product_unit.deleted',
      resource: 'product_unit',
      resourceId: id,
      metadata: { productId },
      request,
    });
    return { productId, id, removed: true as const };
  }

  private assertNotBaseUnit(
    productBaseUnitId: string,
    unitOfMeasureId: string,
  ): void {
    if (unitOfMeasureId === productBaseUnitId) {
      throw new BadRequestException(
        "The product's base unit cannot be added as a product unit",
      );
    }
  }

  private async requireProduct(actor: ActorContext, id: string) {
    const row = await this.prisma.product.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!row) throw new NotFoundException('Product not found');
    return row;
  }

  private async requireUnit(actor: ActorContext, id: string) {
    const row = await this.prisma.unitOfMeasure.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!row) throw new NotFoundException('Unit of measure not found');
    return row;
  }

  private async requireProductUnit(
    actor: ActorContext,
    productId: string,
    id: string,
  ) {
    const row = await this.prisma.productUnit.findFirst({
      where: { id, productId, tenantId: actor.tenantId },
    });
    if (!row) throw new NotFoundException('Product unit not found');
    return row;
  }
}
