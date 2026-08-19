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
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';

function toSupplier(row: {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  address: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return { ...row };
}

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: IdentityAuditClient,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreateSupplierDto,
    request?: RequestAuditMeta,
  ) {
    try {
      const row = await this.prisma.supplier.create({
        data: {
          tenantId: actor.tenantId,
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          address: dto.address?.trim() || null,
        },
      });
      await this.audit.record({
        actor,
        action: 'supplier.created',
        resource: 'supplier',
        resourceId: row.id,
        metadata: { code: row.code, name: row.name },
        request,
      });
      return toSupplier(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Supplier code already exists in this tenant',
        );
      }
      throw error;
    }
  }

  async list(actor: ActorContext) {
    const rows = await this.prisma.supplier.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { code: 'asc' },
    });
    return { items: rows.map(toSupplier) };
  }

  async getById(actor: ActorContext, id: string) {
    return toSupplier(await this.require(actor, id));
  }

  async update(
    actor: ActorContext,
    id: string,
    dto: UpdateSupplierDto,
    request?: RequestAuditMeta,
  ) {
    await this.require(actor, id);
    const data: {
      code?: string;
      name?: string;
      address?: string | null;
      isActive?: boolean;
    } = {};
    if (dto.code !== undefined) data.code = dto.code.trim().toUpperCase();
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.address !== undefined) data.address = dto.address.trim() || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }
    try {
      const row = await this.prisma.supplier.update({ where: { id }, data });
      await this.audit.record({
        actor,
        action: 'supplier.updated',
        resource: 'supplier',
        resourceId: row.id,
        metadata: data,
        request,
      });
      return toSupplier(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Supplier code already exists in this tenant',
        );
      }
      throw error;
    }
  }

  private async require(actor: ActorContext, id: string) {
    const row = await this.prisma.supplier.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!row) throw new NotFoundException('Supplier not found');
    return row;
  }
}
