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
import { CreateUnitDto, UpdateUnitDto } from './dto/unit.dto';

function toUnit(row: {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    code: row.code,
    name: row.name,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class UnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: IdentityAuditClient,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreateUnitDto,
    request?: RequestAuditMeta,
  ) {
    try {
      const row = await this.prisma.unitOfMeasure.create({
        data: {
          tenantId: actor.tenantId,
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
        },
      });
      await this.audit.record({
        actor,
        action: 'unit.created',
        resource: 'unit',
        resourceId: row.id,
        metadata: { code: row.code, name: row.name },
        request,
      });
      return toUnit(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Unit code already exists in this tenant');
      }
      throw error;
    }
  }

  async list(actor: ActorContext) {
    const rows = await this.prisma.unitOfMeasure.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { code: 'asc' },
    });
    return { items: rows.map(toUnit) };
  }

  async getById(actor: ActorContext, id: string) {
    return toUnit(await this.require(actor, id));
  }

  async update(
    actor: ActorContext,
    id: string,
    dto: UpdateUnitDto,
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
      const row = await this.prisma.unitOfMeasure.update({
        where: { id },
        data,
      });
      await this.audit.record({
        actor,
        action: 'unit.updated',
        resource: 'unit',
        resourceId: row.id,
        metadata: data,
        request,
      });
      return toUnit(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Unit code already exists in this tenant');
      }
      throw error;
    }
  }

  private async require(actor: ActorContext, id: string) {
    const row = await this.prisma.unitOfMeasure.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!row) throw new NotFoundException('Unit of measure not found');
    return row;
  }
}
