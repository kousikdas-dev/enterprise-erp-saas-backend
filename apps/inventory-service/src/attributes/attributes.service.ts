import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { ActorContext, RequestAuditMeta } from '../auth/actor-context';
import { parseMoney } from '../common/decimal';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueConstraintError } from '../prisma/prisma-errors';
import {
  toAttributeResponse,
  toAttributeValueResponse,
} from './dto/attribute-response';
import { CreateAttributeDto, UpdateAttributeDto } from './dto/attribute.dto';
import {
  CreateAttributeValueDto,
  UpdateAttributeValueDto,
} from './dto/attribute-value.dto';

@Injectable()
export class AttributesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: IdentityAuditClient,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreateAttributeDto,
    request?: RequestAuditMeta,
  ) {
    try {
      const row = await this.prisma.attribute.create({
        data: {
          tenantId: actor.tenantId,
          name: dto.name.trim(),
          displayType: dto.displayType,
          variantCreation: dto.variantCreation,
          values: dto.values?.length
            ? {
                create: dto.values.map((v, index) => ({
                  tenantId: actor.tenantId,
                  value: v.value.trim(),
                  isCustom: v.isCustom ?? false,
                  extraPrice: parseMoney(v.extraPrice ?? '0'),
                  sequence: v.sequence ?? index,
                })),
              }
            : undefined,
        },
        include: { values: { orderBy: { sequence: 'asc' } } },
      });
      await this.audit.record({
        actor,
        action: 'attribute.created',
        resource: 'attribute',
        resourceId: row.id,
        metadata: { name: row.name },
        request,
      });
      return toAttributeResponse(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Attribute name already exists in this tenant',
        );
      }
      throw error;
    }
  }

  async list(actor: ActorContext) {
    const rows = await this.prisma.attribute.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { name: 'asc' },
    });
    return { items: rows.map(toAttributeResponse) };
  }

  async getById(actor: ActorContext, id: string) {
    const row = await this.prisma.attribute.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: { values: { orderBy: { sequence: 'asc' } } },
    });
    if (!row) throw new NotFoundException('Attribute not found');
    return toAttributeResponse(row);
  }

  async update(
    actor: ActorContext,
    id: string,
    dto: UpdateAttributeDto,
    request?: RequestAuditMeta,
  ) {
    await this.require(actor, id);
    const data: {
      name?: string;
      displayType?: UpdateAttributeDto['displayType'];
      variantCreation?: UpdateAttributeDto['variantCreation'];
      isActive?: boolean;
    } = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.displayType !== undefined) data.displayType = dto.displayType;
    if (dto.variantCreation !== undefined)
      data.variantCreation = dto.variantCreation;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }
    try {
      const row = await this.prisma.attribute.update({
        where: { id },
        data,
        include: { values: { orderBy: { sequence: 'asc' } } },
      });
      await this.audit.record({
        actor,
        action: 'attribute.updated',
        resource: 'attribute',
        resourceId: row.id,
        metadata: data,
        request,
      });
      return toAttributeResponse(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Attribute name already exists in this tenant',
        );
      }
      throw error;
    }
  }

  async addValue(
    actor: ActorContext,
    attributeId: string,
    dto: CreateAttributeValueDto,
    request?: RequestAuditMeta,
  ) {
    await this.require(actor, attributeId);
    try {
      const row = await this.prisma.attributeValue.create({
        data: {
          tenantId: actor.tenantId,
          attributeId,
          value: dto.value.trim(),
          isCustom: dto.isCustom ?? false,
          extraPrice: parseMoney(dto.extraPrice ?? '0'),
          sequence: dto.sequence ?? 0,
        },
      });
      await this.audit.record({
        actor,
        action: 'attribute_value.created',
        resource: 'attribute_value',
        resourceId: row.id,
        metadata: { attributeId, value: row.value },
        request,
      });
      return toAttributeValueResponse(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'This value already exists for the attribute',
        );
      }
      throw error;
    }
  }

  async updateValue(
    actor: ActorContext,
    attributeId: string,
    valueId: string,
    dto: UpdateAttributeValueDto,
    request?: RequestAuditMeta,
  ) {
    await this.require(actor, attributeId);
    await this.requireValue(actor, attributeId, valueId);
    const data: {
      value?: string;
      isCustom?: boolean;
      extraPrice?: ReturnType<typeof parseMoney>;
      sequence?: number;
    } = {};
    if (dto.value !== undefined) data.value = dto.value.trim();
    if (dto.isCustom !== undefined) data.isCustom = dto.isCustom;
    if (dto.extraPrice !== undefined)
      data.extraPrice = parseMoney(dto.extraPrice);
    if (dto.sequence !== undefined) data.sequence = dto.sequence;
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }
    try {
      const row = await this.prisma.attributeValue.update({
        where: { id: valueId },
        data,
      });
      await this.audit.record({
        actor,
        action: 'attribute_value.updated',
        resource: 'attribute_value',
        resourceId: row.id,
        metadata: { attributeId, ...data },
        request,
      });
      return toAttributeValueResponse(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'This value already exists for the attribute',
        );
      }
      throw error;
    }
  }

  async removeValue(
    actor: ActorContext,
    attributeId: string,
    valueId: string,
    request?: RequestAuditMeta,
  ) {
    await this.require(actor, attributeId);
    await this.requireValue(actor, attributeId, valueId);
    await this.prisma.attributeValue.delete({ where: { id: valueId } });
    await this.audit.record({
      actor,
      action: 'attribute_value.deleted',
      resource: 'attribute_value',
      resourceId: valueId,
      metadata: { attributeId },
      request,
    });
    return { attributeId, id: valueId, removed: true as const };
  }

  private async require(actor: ActorContext, id: string) {
    const row = await this.prisma.attribute.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!row) throw new NotFoundException('Attribute not found');
    return row;
  }

  private async requireValue(
    actor: ActorContext,
    attributeId: string,
    valueId: string,
  ) {
    const row = await this.prisma.attributeValue.findFirst({
      where: { id: valueId, attributeId, tenantId: actor.tenantId },
    });
    if (!row) throw new NotFoundException('Attribute value not found');
    return row;
  }
}
