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
import { toFiscalPosition } from './dto/fiscal-position-response';
import {
  CreateFiscalPositionDto,
  UpdateFiscalPositionDto,
} from './dto/fiscal-position.dto';

@Injectable()
export class FiscalPositionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: IdentityAuditClient,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreateFiscalPositionDto,
    request?: RequestAuditMeta,
  ) {
    try {
      const row = await this.prisma.fiscalPosition.create({
        data: {
          tenantId: actor.tenantId,
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
        },
      });

      await this.audit.record({
        actor,
        action: 'fiscal_position.created',
        resource: 'fiscal_position',
        resourceId: row.id,
        metadata: {
          code: row.code,
          name: row.name,
        },
        request,
      });

      return toFiscalPosition(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Fiscal position code already exists in this tenant',
        );
      }

      throw error;
    }
  }

  async list(actor: ActorContext) {
    const rows = await this.prisma.fiscalPosition.findMany({
      where: {
        tenantId: actor.tenantId,
      },
      orderBy: {
        code: 'asc',
      },
    });

    return {
      items: rows.map(toFiscalPosition),
    };
  }

  async getById(actor: ActorContext, id: string) {
    return toFiscalPosition(await this.require(actor, id));
  }

  async update(
    actor: ActorContext,
    id: string,
    dto: UpdateFiscalPositionDto,
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
      const row = await this.prisma.fiscalPosition.update({
        where: {
          id,
        },
        data,
      });

      await this.audit.record({
        actor,
        action: 'fiscal_position.updated',
        resource: 'fiscal_position',
        resourceId: row.id,
        metadata: data,
        request,
      });

      return toFiscalPosition(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Fiscal position code already exists in this tenant',
        );
      }

      throw error;
    }
  }

  async require(actor: ActorContext, id: string) {
    const row = await this.prisma.fiscalPosition.findFirst({
      where: {
        id,
        tenantId: actor.tenantId,
      },
    });

    if (!row) {
      throw new NotFoundException('Fiscal position not found');
    }

    return row;
  }
}