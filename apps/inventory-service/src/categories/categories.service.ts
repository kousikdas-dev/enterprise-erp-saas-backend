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
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { toCategoryResponse } from './dto/category-response';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: IdentityAuditClient,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreateCategoryDto,
    request?: RequestAuditMeta,
  ) {
    try {
      const row = await this.prisma.category.create({
        data: {
          tenantId: actor.tenantId,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
        },
      });
      await this.audit.record({
        actor,
        action: 'category.created',
        resource: 'category',
        resourceId: row.id,
        metadata: { name: row.name },
        request,
      });
      return toCategoryResponse(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Category name already exists in this tenant',
        );
      }
      throw error;
    }
  }

  async list(actor: ActorContext) {
    const rows = await this.prisma.category.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { name: 'asc' },
    });
    return { items: rows.map(toCategoryResponse) };
  }

  async getById(actor: ActorContext, id: string) {
    return toCategoryResponse(await this.require(actor, id));
  }

  async update(
    actor: ActorContext,
    id: string,
    dto: UpdateCategoryDto,
    request?: RequestAuditMeta,
  ) {
    await this.require(actor, id);
    const data: {
      name?: string;
      description?: string | null;
      isActive?: boolean;
    } = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined)
      data.description = dto.description.trim() || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }
    try {
      const row = await this.prisma.category.update({ where: { id }, data });
      await this.audit.record({
        actor,
        action: 'category.updated',
        resource: 'category',
        resourceId: row.id,
        metadata: data,
        request,
      });
      return toCategoryResponse(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Category name already exists in this tenant',
        );
      }
      throw error;
    }
  }

  private async require(actor: ActorContext, id: string) {
    const row = await this.prisma.category.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!row) throw new NotFoundException('Category not found');
    return row;
  }
}
