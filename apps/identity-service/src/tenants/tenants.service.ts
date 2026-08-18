import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Tenant } from '../../generated/prisma-client';
import { ActorContext, RequestAuditMeta } from '../audit/audit.types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueConstraintError } from '../prisma/prisma-errors';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { toTenantResponse } from './dto/tenant-response.dto';
import { UpdateTenantStatusDto } from './dto/update-tenant-status.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreateTenantDto,
    request?: RequestAuditMeta,
  ) {
    const name = dto.name.trim();
    const code = dto.code.trim().toUpperCase();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({ data: { name, code } });
        await this.audit.record(
          {
            actor,
            resourceTenantId: tenant.id,
            action: 'tenant.created',
            resource: 'tenant',
            resourceId: tenant.id,
            metadata: { name: tenant.name, code: tenant.code },
            request,
          },
          tx,
        );
        return toTenantResponse(tenant);
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Tenant code already exists');
      }
      throw error;
    }
  }

  async list(actor: ActorContext) {
    const tenants = await this.prisma.tenant.findMany({
      where: { id: actor.tenantId },
      orderBy: { code: 'asc' },
    });
    return { items: tenants.map(toTenantResponse) };
  }

  async getById(actor: ActorContext, id: string) {
    return toTenantResponse(await this.requireOwnTenant(actor, id));
  }

  async update(
    actor: ActorContext,
    id: string,
    dto: UpdateTenantDto,
    request?: RequestAuditMeta,
  ) {
    if (!dto.name) {
      throw new BadRequestException('No fields to update');
    }
    const existing = await this.requireOwnTenant(actor, id);
    const name = dto.name.trim();
    const tenant = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.tenant.update({
        where: { id: existing.id },
        data: { name },
      });
      await this.audit.record(
        {
          actor,
          resourceTenantId: updated.id,
          action: 'tenant.updated',
          resource: 'tenant',
          resourceId: updated.id,
          metadata: { name: updated.name },
          request,
        },
        tx,
      );
      return updated;
    });
    return toTenantResponse(tenant);
  }

  async updateStatus(
    actor: ActorContext,
    id: string,
    dto: UpdateTenantStatusDto,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.requireOwnTenant(actor, id);
    const tenant = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.tenant.update({
        where: { id: existing.id },
        data: { status: dto.status },
      });
      await this.audit.record(
        {
          actor,
          resourceTenantId: updated.id,
          action: 'tenant.status_changed',
          resource: 'tenant',
          resourceId: updated.id,
          metadata: { from: existing.status, to: updated.status },
          request,
        },
        tx,
      );
      return updated;
    });
    return toTenantResponse(tenant);
  }

  private async requireOwnTenant(
    actor: ActorContext,
    id: string,
  ): Promise<Tenant> {
    if (id !== actor.tenantId) {
      throw new NotFoundException('Tenant not found');
    }
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }
}
