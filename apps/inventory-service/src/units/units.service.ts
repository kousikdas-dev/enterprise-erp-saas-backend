import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma-client';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { ActorContext, RequestAuditMeta } from '../auth/actor-context';
import { parsePositiveDecimal, quantityToString } from '../common/decimal';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueConstraintError } from '../prisma/prisma-errors';
import { CreateUnitDto, UpdateUnitDto } from './dto/unit.dto';

const UNIT_INCLUDE = {
  referenceUnit: { select: { code: true, name: true } },
  unspscCategory: { select: { code: true, name: true } },
} as const;

function toUnit(row: {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  referenceUnitId: string | null;
  conversionFactor: Prisma.Decimal | null;
  referenceUnit?: { code: string; name: string } | null;
  unspscCategoryId: string | null;
  unspscCategory?: { code: string; name: string } | null;
}) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    code: row.code,
    name: row.name,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    referenceUnitId: row.referenceUnitId,
    conversionFactor: row.conversionFactor
      ? quantityToString(row.conversionFactor)
      : null,
    referenceUnitCode: row.referenceUnit?.code ?? null,
    referenceUnitName: row.referenceUnit?.name ?? null,
    unspscCategoryId: row.unspscCategoryId,
    unspscCategoryCode: row.unspscCategory?.code ?? null,
    unspscCategoryName: row.unspscCategory?.name ?? null,
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
    const reference = await this.resolveReference(
      actor,
      null,
      dto.referenceUnitId,
      dto.conversionFactor,
    );
    if (dto.unspscCategoryId !== undefined) {
      await this.requireUnspscCategory(actor, dto.unspscCategoryId);
    }
    try {
      const row = await this.prisma.unitOfMeasure.create({
        data: {
          tenantId: actor.tenantId,
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          referenceUnitId: reference?.referenceUnitId ?? null,
          conversionFactor: reference?.conversionFactor ?? null,
          unspscCategoryId: dto.unspscCategoryId ?? null,
        },
        include: UNIT_INCLUDE,
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
      include: UNIT_INCLUDE,
    });
    return { items: rows.map(toUnit) };
  }

  async getById(actor: ActorContext, id: string) {
    const row = await this.prisma.unitOfMeasure.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: UNIT_INCLUDE,
    });
    if (!row) throw new NotFoundException('Unit of measure not found');
    return toUnit(row);
  }

  async update(
    actor: ActorContext,
    id: string,
    dto: UpdateUnitDto,
    request?: RequestAuditMeta,
  ) {
    await this.require(actor, id);
    const data: {
      code?: string;
      name?: string;
      isActive?: boolean;
      referenceUnitId?: string | null;
      conversionFactor?: ReturnType<typeof parsePositiveDecimal> | null;
      unspscCategoryId?: string | null;
    } = {};
    if (dto.code !== undefined) data.code = dto.code.trim().toUpperCase();
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.referenceUnitId !== undefined || dto.conversionFactor !== undefined) {
      const reference = await this.resolveReference(
        actor,
        id,
        dto.referenceUnitId,
        dto.conversionFactor,
      );
      data.referenceUnitId = reference?.referenceUnitId ?? null;
      data.conversionFactor = reference?.conversionFactor ?? null;
    }
    if (dto.unspscCategoryId !== undefined) {
      await this.requireUnspscCategory(actor, dto.unspscCategoryId);
      data.unspscCategoryId = dto.unspscCategoryId;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }
    try {
      const row = await this.prisma.unitOfMeasure.update({
        where: { id },
        data,
        include: UNIT_INCLUDE,
      });
      await this.audit.record({
        actor,
        action: 'unit.updated',
        resource: 'unit',
        resourceId: row.id,
        metadata: {
          code: data.code,
          name: data.name,
          isActive: data.isActive,
          referenceUnitId: data.referenceUnitId,
        },
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

  /**
   * referenceUnitId and conversionFactor must be set together. Returns null
   * when neither is given (leaves the unit as a base unit / unchanged).
   * Only blocks direct self-reference — a longer reference cycle (A -> B -> A)
   * isn't detected, since this is descriptive master data, not something
   * any conversion math in this app currently walks transitively.
   */
  private async resolveReference(
    actor: ActorContext,
    unitId: string | null,
    referenceUnitId: string | undefined,
    conversionFactor: string | undefined,
  ): Promise<{
    referenceUnitId: string;
    conversionFactor: ReturnType<typeof parsePositiveDecimal>;
  } | null> {
    if (referenceUnitId === undefined && conversionFactor === undefined) {
      return null;
    }
    if (referenceUnitId === undefined || conversionFactor === undefined) {
      throw new BadRequestException(
        'referenceUnitId and conversionFactor must be set together',
      );
    }
    if (unitId && referenceUnitId === unitId) {
      throw new BadRequestException('A unit cannot reference itself');
    }
    await this.require(actor, referenceUnitId);
    return {
      referenceUnitId,
      conversionFactor: parsePositiveDecimal(conversionFactor),
    };
  }

  private async require(actor: ActorContext, id: string) {
    const row = await this.prisma.unitOfMeasure.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!row) throw new NotFoundException('Unit of measure not found');
    return row;
  }

  private async requireUnspscCategory(actor: ActorContext, id: string) {
    const row = await this.prisma.unspscCategory.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!row) throw new NotFoundException('UNSPSC category not found');
    return row;
  }
}
