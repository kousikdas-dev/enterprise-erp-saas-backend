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
import { toIndustry } from './dto/industry-response';
import {
  CreateIndustryDto,
  UpdateIndustryDto,
} from './dto/industry.dto';

@Injectable()
export class IndustriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: IdentityAuditClient,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreateIndustryDto,
    request?: RequestAuditMeta,
  ) {
    try {
      const row = await this.prisma.industry.create({
        data: {
          tenantId: actor.tenantId,
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
        },
      });

      await this.audit.record({
        actor,
        action: 'industry.created',
        resource: 'industry',
        resourceId: row.id,
        metadata: {
          code: row.code,
          name: row.name,
        },
        request,
      });

      return toIndustry(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Industry code already exists in this tenant',
        );
      }

      throw error;
    }
  }

  async list(actor: ActorContext) {
    const rows = await this.prisma.industry.findMany({
      where: {
        tenantId: actor.tenantId,
      },
      orderBy: {
        code: 'asc',
      },
    });

    return {
      items: rows.map(toIndustry),
    };
  }

  async getById(actor: ActorContext, id: string) {
    return toIndustry(await this.require(actor, id));
  }

  async update(
    actor: ActorContext,
    id: string,
    dto: UpdateIndustryDto,
    request?: RequestAuditMeta,
  ) {
    await this.require(actor, id);

    const data: {
      code?: string;
      name?: string;
      isActive?: boolean;
    } = {};

    if (dto.code !== undefined) {
      data.code = dto.code.trim().toUpperCase();
    }

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }

    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }

    try {
      const row = await this.prisma.industry.update({
        where: {
          id,
        },
        data,
      });

      await this.audit.record({
        actor,
        action: 'industry.updated',
        resource: 'industry',
        resourceId: row.id,
        metadata: data,
        request,
      });

      return toIndustry(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Industry code already exists in this tenant',
        );
      }

      throw error;
    }
  }

  async require(actor: ActorContext, id: string) {
    const row = await this.prisma.industry.findFirst({
      where: {
        id,
        tenantId: actor.tenantId,
      },
    });

    if (!row) {
      throw new NotFoundException('Industry not found');
    }

    return row;
  }
}