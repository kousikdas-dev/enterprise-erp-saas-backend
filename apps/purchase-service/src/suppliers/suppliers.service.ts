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
import { toSupplier } from './dto/supplier-response';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';

const ADDRESS_ORDER_BY = [
  { type: 'asc' as const },
  { isDefault: 'desc' as const },
  { createdAt: 'asc' as const },
];

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

          company: dto.company?.trim() || null,
          email: dto.email?.trim().toLowerCase() || null,
          phone: dto.phone?.trim() || null,
          jobPosition: dto.jobPosition?.trim() || null,
          website: dto.website?.trim() || null,
          tags: dto.tags ?? [],
          gstin: dto.gstin?.trim().toUpperCase() || null,

          paymentTermId: dto.paymentTermId || null,
          fiscalPositionId: dto.fiscalPositionId || null,
          industryId: dto.industryId || null,

          notes: dto.notes?.trim() || null,
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
      include: { addresses: { orderBy: ADDRESS_ORDER_BY } },
    });
    return { items: rows.map(toSupplier) };
  }

  async getById(actor: ActorContext, id: string) {
    const row = await this.prisma.supplier.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: { addresses: { orderBy: ADDRESS_ORDER_BY } },
    });
    if (!row) throw new NotFoundException('Supplier not found');
    return toSupplier(row);
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
      company?: string | null;
      email?: string | null;
      phone?: string | null;
      jobPosition?: string | null;
      website?: string | null;
      tags?: string[];
      gstin?: string | null;
      paymentTermId?: string | null;
      fiscalPositionId?: string | null;
      industryId?: string | null;
      notes?: string | null;
      address?: string | null;
      isActive?: boolean;
    } = {};
    if (dto.code !== undefined) data.code = dto.code.trim().toUpperCase();
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.company !== undefined) data.company = dto.company?.trim() || null;
    if (dto.email !== undefined) {
      data.email = dto.email?.trim().toLowerCase() || null;
    }
    if (dto.phone !== undefined) data.phone = dto.phone?.trim() || null;
    if (dto.jobPosition !== undefined) {
      data.jobPosition = dto.jobPosition?.trim() || null;
    }
    if (dto.website !== undefined) data.website = dto.website?.trim() || null;
    if (dto.tags !== undefined) data.tags = dto.tags;
    if (dto.gstin !== undefined) {
      data.gstin = dto.gstin?.trim().toUpperCase() || null;
    }
    if (dto.paymentTermId !== undefined) {
      data.paymentTermId = dto.paymentTermId || null;
    }
    if (dto.fiscalPositionId !== undefined) {
      data.fiscalPositionId = dto.fiscalPositionId || null;
    }
    if (dto.industryId !== undefined) {
      data.industryId = dto.industryId || null;
    }
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
    if (dto.address !== undefined) data.address = dto.address?.trim() || null;
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

  async require(actor: ActorContext, id: string) {
    const row = await this.prisma.supplier.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!row) throw new NotFoundException('Supplier not found');
    return row;
  }
}
