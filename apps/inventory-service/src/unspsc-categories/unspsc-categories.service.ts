import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { ActorContext, RequestAuditMeta } from '../auth/actor-context';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueConstraintError } from '../prisma/prisma-errors';
import {
  CreateUnspscCategoryDto,
  UpdateUnspscCategoryDto,
} from './dto/unspsc-category.dto';
import { toUnspscCategoryResponse } from './dto/unspsc-category-response';

@Injectable()
export class UnspscCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: IdentityAuditClient,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreateUnspscCategoryDto,
    request?: RequestAuditMeta,
  ) {
    try {
      const row = await this.prisma.unspscCategory.create({
        data: {
          tenantId: actor.tenantId,
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
        },
      });
      await this.audit.record({
        actor,
        action: 'unspsc_category.created',
        resource: 'unspsc_category',
        resourceId: row.id,
        metadata: { code: row.code, name: row.name },
        request,
      });
      return toUnspscCategoryResponse(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'UNSPSC category code already exists in this tenant',
        );
      }
      throw error;
    }
  }

  async list(actor: ActorContext) {
    const rows = await this.prisma.unspscCategory.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { code: 'asc' },
    });
    return { items: rows.map(toUnspscCategoryResponse) };
  }

  async getById(actor: ActorContext, id: string) {
    return toUnspscCategoryResponse(await this.require(actor, id));
  }

  async update(
    actor: ActorContext,
    id: string,
    dto: UpdateUnspscCategoryDto,
    request?: RequestAuditMeta,
  ) {
    await this.require(actor, id);
    const data: { code?: string; name?: string; isActive?: boolean } = {};
    if (dto.code !== undefined) data.code = dto.code.trim().toUpperCase();
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }
    try {
      const row = await this.prisma.unspscCategory.update({
        where: { id },
        data,
      });
      await this.audit.record({
        actor,
        action: 'unspsc_category.updated',
        resource: 'unspsc_category',
        resourceId: row.id,
        metadata: data,
        request,
      });
      return toUnspscCategoryResponse(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'UNSPSC category code already exists in this tenant',
        );
      }
      throw error;
    }
  }

  private async require(actor: ActorContext, id: string) {
    const row = await this.prisma.unspscCategory.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!row) throw new NotFoundException('UNSPSC category not found');
    return row;
  }
}
